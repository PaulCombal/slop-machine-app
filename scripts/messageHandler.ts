import {ensureDevelopmentAssets} from "../utils/utils.mts";
import {getAuthenticatedClient, uploadShort} from "../utils/google.mts";
import {Job, Worker} from "bullmq";
import type {OutputConfig} from "../types/app";
import {cleanS3} from "../utils/cleanS3.ts";
import {prepareAllVideoAssets} from "../utils/prepareAllVideoAssets.ts";
import {prepareEpisodeAssets} from "../utils/prepareEpisodeAssets.ts";
import {assetsQueue, postingQueue} from "../clients/queues.mts";
import {queueVideoPipeline} from "../utils/queueVideoPipeline.ts";
import {queueShowEpisodePipeline} from "../utils/queueShowEpisodePipeline.ts";
import {getShow} from "../show.mts";
import {generateSeriesBreakdown} from "../steps/generate_series.mts";
import {loadManifest, saveManifest} from "../utils/seriesManifest.ts";
import type {UploadPlatform} from "../persona_group.mts";
import {ensureDatabaseReady} from "../db/bootstrap.ts";
import {initRegistryCache} from "../repositories/registryCache.ts";

// Definitions now live in Postgres. Apply migrations + seed (idempotent), then
// load the in-memory registry cache BEFORE the worker can pick up a job and call
// getShow/getPersona synchronously.
console.log('== Preparing definitions database')
const admin = await ensureDatabaseReady();
await initRegistryCache(admin.id);

console.log('== Setting up repeatable tasks')
// System schedulers are ALWAYS ensured in code (not user-editable).
await setupS3CleaningScheduler();
// Content schedulers are seeded ONCE. After that Valkey is the source of truth
// (driven by the control-plane UI), so a UI delete is not undone on restart.
await seedContentSchedulersOnce();

type AssetsJobData = {
  personaGroupName?: string;
  carryingPersona?: string;
  renderId?: string;
  // Show (multi-episode series) fields
  showId?: string;
  episodeIndex?: number;
  schedulerId?: string;
  render?: boolean;
  upload?: boolean;
};

type AssetsJob = Job<AssetsJobData>;
type JobHandler = (job: AssetsJob) => Promise<unknown>;

async function handleTriggerVideoFlow(job: AssetsJob) {
  const {personaGroupName, carryingPersona} = job.data;
  if (!personaGroupName || !carryingPersona) {
    throw new Error('trigger-video-flow: missing personaGroupName or carryingPersona');
  }
  await queueVideoPipeline(personaGroupName, carryingPersona, {automated: true});
  return {...job.data};
}

async function handleGenerateAssets(job: AssetsJob) {
  await ensureDevelopmentAssets();
  const {personaGroupName, carryingPersona, renderId} = job.data;
  if (!personaGroupName || !carryingPersona) {
    throw new Error('generate-assets: missing personaGroupName or carryingPersona');
  }
  if (!renderId) {
    throw new Error('generate-assets: missing renderId');
  }
  const renderData = await prepareAllVideoAssets(personaGroupName, carryingPersona, renderId);

  return {renderId: renderData.renderId, fake: false, showProgress: false};
}

async function handleShowTick(job: AssetsJob) {
  const {showId, schedulerId, render, upload} = job.data;
  if (!showId) {
    throw new Error('show-tick: missing showId');
  }

  // Compute the full series breakdown once, then persist it. Subsequent
  // ticks just drip the next pending episode through the pipeline.
  let manifest = await loadManifest(showId);
  if (!manifest) {
    console.log(`== Generating series breakdown for show "${showId}"`);
    manifest = await generateSeriesBreakdown(getShow(showId));
    await saveManifest(manifest);
    console.log(`= ${manifest.episodes.length} episodes planned`);
  }

  const next = manifest.episodes.find(e => e.status === 'pending');
  if (!next) {
    console.log(`✅ Show "${showId}" fully dispatched — nothing pending`);
    if (schedulerId) {
      await assetsQueue.removeJobScheduler(schedulerId);
      console.log(`🗑️  Removed scheduler "${schedulerId}"`);
    }
    return {showId, done: true};
  }

  // Mark queued BEFORE enqueuing so a retry can't double-produce the episode.
  next.status = 'queued';
  await saveManifest(manifest);
  await queueShowEpisodePipeline(showId, next.index, {render, upload});
  console.log(`📤 Queued episode ${next.index + 1}/${manifest.episodes.length} of "${showId}"`);

  return {showId, episode: next.index, pending: manifest.episodes.filter(e => e.status === 'pending').length};
}

async function handleShowBreakdown(job: AssetsJob) {
  const {showId} = job.data;
  if (!showId) {
    throw new Error('show-breakdown: missing showId');
  }

  // Break the whole prose into an episode manifest WITHOUT rendering anything,
  // so the episodes can be reviewed before any renders are scheduled. Overwrites
  // any existing manifest for this show.
  console.log(`== Generating series breakdown for show "${showId}"`);
  const manifest = await generateSeriesBreakdown(getShow(showId));
  await saveManifest(manifest);
  console.log(`= ${manifest.episodes.length} episodes planned for "${showId}"`);

  return {showId, episodes: manifest.episodes.length};
}

async function handleGenerateEpisodeAssets(job: AssetsJob) {
  await ensureDevelopmentAssets();
  const {showId, episodeIndex, renderId} = job.data;
  if (!showId || episodeIndex === undefined) {
    throw new Error('generate-episode-assets: missing showId or episodeIndex');
  }
  if (!renderId) {
    throw new Error('generate-episode-assets: missing renderId');
  }

  const renderData = await prepareEpisodeAssets(showId, episodeIndex, renderId);

  // Record completion + renderId on the manifest.
  const manifest = await loadManifest(showId);
  const episode = manifest?.episodes[episodeIndex];
  if (manifest && episode) {
    episode.status = 'done';
    episode.renderId = renderData.renderId;
    await saveManifest(manifest);
  }

  return {renderId: renderData.renderId, fake: false, showProgress: false};
}

// Render a single episode on demand (no upload). Mirrors a show-tick for one
// chosen episode: mark it queued so the UI reflects it, then run the
// render-only pipeline. The renderId is recorded on the manifest by
// generate-episode-assets once it completes.
async function handleRenderEpisode(job: AssetsJob) {
  const {showId, episodeIndex} = job.data;
  if (!showId || episodeIndex === undefined) {
    throw new Error('render-episode: missing showId or episodeIndex');
  }
  const manifest = await loadManifest(showId);
  const episode = manifest?.episodes[episodeIndex];
  if (!manifest || !episode) {
    throw new Error(`render-episode: no episode ${episodeIndex} for show "${showId}"`);
  }
  episode.status = 'queued';
  await saveManifest(manifest);
  await queueShowEpisodePipeline(showId, episodeIndex, {upload: false});
  console.log(`📤 Queued render of episode ${episodeIndex + 1} of "${showId}"`);
  return {showId, episode: episodeIndex};
}

// Publish an already-rendered episode: dispatch uploads for the renderId stored
// on the manifest. Errors if the episode hasn't been rendered yet.
async function handlePublishEpisode(job: AssetsJob) {
  const {showId, episodeIndex} = job.data;
  if (!showId || episodeIndex === undefined) {
    throw new Error('publish-episode: missing showId or episodeIndex');
  }
  const manifest = await loadManifest(showId);
  const episode = manifest?.episodes[episodeIndex];
  if (!manifest || !episode) {
    throw new Error(`publish-episode: no episode ${episodeIndex} for show "${showId}"`);
  }
  if (!episode.renderId) {
    throw new Error(`publish-episode: episode ${episodeIndex} of "${showId}" not rendered yet`);
  }
  await assetsQueue.add('dispatch-uploads', {renderId: episode.renderId}, {
    attempts: 3,
    backoff: {type: 'exponential', delay: 5000},
  });
  console.log(`📤 Queued publish of episode ${episodeIndex + 1} of "${showId}" (${episode.renderId})`);
  return {showId, episode: episodeIndex, renderId: episode.renderId};
}

async function handleDispatchUploads(job: AssetsJob) {
  const children = await job.getChildrenValues();
  const values = Object.values(children)[0] as { renderId?: string } | undefined;
  // renderId comes from the render-video child in the pipeline, or directly on
  // the job when publishing an already-rendered episode (publish-episode).
  const renderId = values?.renderId ?? job.data.renderId;
  if (!renderId) {
    throw new Error('dispatch-uploads: missing renderId from child');
  }

  const configFile = Bun.s3.file(`output/${renderId}/config.json`);
  const config: OutputConfig = await configFile.json();
  const platforms: UploadPlatform[] = config.personae.platforms ?? ['yt'];

  console.log(`== Dispatching uploads for ${renderId} to: ${platforms.join(', ') || '(none)'}`);

  const channelId = config.personae.channelId;
  const enqueued: { platform: UploadPlatform; jobId?: string }[] = [];
  for (const platform of platforms) {
    if (platform === 'yt') {
      const j = await assetsQueue.add('upload-to-youtube', { renderId }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      });
      enqueued.push({ platform, jobId: j.id });
    } else if (platform === 'ig') {
      if (process.env.DEBUG !== "false") {
        console.log("⏭️  Skipping ig-upload enqueue in DEBUG mode");
        enqueued.push({ platform });
        continue;
      }
      const j = await postingQueue.add('ig-upload', { renderId, channelId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
      });
      enqueued.push({ platform, jobId: j.id });
    } else if (platform === 'tt') {
      console.warn(`⏭️  Platform "tt" not implemented yet — skipping`);
    } else {
      console.warn(`⏭️  Unknown platform "${platform}" — skipping`);
    }
  }

  return { renderId, enqueued };
}

async function handleUploadToYoutube(job: AssetsJob) {
  console.log("== Uploading to Youtube");

  const renderId = job.data.renderId;
  if (!renderId) {
    throw new Error('upload-to-youtube: missing renderId');
  }

  const configFile = Bun.s3.file(`output/${renderId}/config.json`);
  const config: OutputConfig = await configFile.json();
  const googleCredentials = await getAuthenticatedClient(config.personae.channelId);
  const uploadResult = await uploadShort(
    config.topic,
    googleCredentials,
    "output/" + renderId + "/render.mp4",
  );

  if (!uploadResult) {
    if (process.env.DEBUG !== "false") {
      return { youtubeVideoId: null };
    }
    throw new Error('Upload result is empty')
  }

  console.log(`✅ Upload Successful! ID: ${uploadResult.id}`);
  console.log(`Watch URL: https://youtube.com/shorts/${uploadResult.id}`);
  await job.log(`Watch URL: https://youtube.com/shorts/${uploadResult.id}`);

  return {
    youtubeVideoId: uploadResult.id
  };
}

async function handleCleanS3() {
  await cleanS3();
  console.log("S3 Cleanup complete.");
}

const HANDLERS: Record<string, JobHandler> = {
  'trigger-video-flow': handleTriggerVideoFlow,
  'generate-assets': handleGenerateAssets,
  'show-tick': handleShowTick,
  'show-breakdown': handleShowBreakdown,
  'generate-episode-assets': handleGenerateEpisodeAssets,
  'render-episode': handleRenderEpisode,
  'publish-episode': handlePublishEpisode,
  'dispatch-uploads': handleDispatchUploads,
  'upload-to-youtube': handleUploadToYoutube,
  'clean-s3': handleCleanS3,
};

console.log('== Creating main app worker')
const worker = new Worker('assets-pipeline', async (job: Job<AssetsJobData>) => {
  const handler = HANDLERS[job.name];
  if (!handler) {
    throw new Error('Unknown job: ' + job.name);
  }
  return await handler(job);
}, {
  connection: {host: process.env.QUEUE_HOST || 'valkey', port: 6379}
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed with error: ${err.message}`);
});

worker.on('error', err => {
  console.error('Worker connection error:', err);
});

async function setupS3CleaningScheduler() {
  const SCHEDULER_ID = 'clean-s3-scheduler';

  await assetsQueue.upsertJobScheduler(
    SCHEDULER_ID,
    {
      pattern: '0 0 * * *',
    },
    {
      name: 'clean-s3',
      data: { reason: 'scheduled_cleanup' },
    }
  );

  console.log(`📅 Job Scheduler "${SCHEDULER_ID}" is active.`);
}

/**
 * Seed the default content schedulers exactly once, guarded by a Valkey flag.
 * Without this guard the worker would re-`upsert` them on every boot, silently
 * undoing any schedule a user deleted through the control-plane UI. After the
 * first seed, Valkey (the BullMQ scheduler store) is the single source of truth.
 */
async function seedContentSchedulersOnce() {
  const SEED_FLAG = 'schedulers:seeded';
  const client = await assetsQueue.client;

  if (await client.get(SEED_FLAG)) {
    console.log('⏭️  Content schedulers already seeded — Valkey is source of truth');
    return;
  }

  await setupVideoPipelineScheduler('daily-technews-scheduler', '30 23 * * *', 'techV2', 'techguy');
  await setupVideoPipelineScheduler('daily-peterlois-scheduler', '30 22 * * *', 'peterLoisPolitics', 'peter');
  await client.set(SEED_FLAG, '1');
  console.log('🌱 Seeded default content schedulers (first boot)');
}

async function setupVideoPipelineScheduler(schedulerId: string, cronPattern: string, personaGroupName: string, carryingPersonaName: string) {
  await assetsQueue.upsertJobScheduler(
    schedulerId,
    {
      pattern: cronPattern,
    },
    {
      name: 'trigger-video-flow',
      data: {
        personaGroupName,
        carryingPersona: carryingPersonaName
      },
    }
  );
}

/**
 * Drip a Show one episode at a time on a cadence, exactly like the daily
 * upload scheduler. Each tick produces the next pending episode; the tick
 * self-removes this scheduler once the whole series has been dispatched.
 *
 * Example: setupShowScheduler('secretStory-scheduler', '0 20 * * *', 'secretStoryDebug')
 */
async function setupShowScheduler(schedulerId: string, cronPattern: string, showId: string) {
  await assetsQueue.upsertJobScheduler(
    schedulerId,
    {
      pattern: cronPattern,
    },
    {
      name: 'show-tick',
      data: { showId, schedulerId },
    }
  );
  console.log(`📅 Show scheduler "${schedulerId}" is active for "${showId}".`);
}