import {ensureDevelopmentAssets} from "../utils/utils.mts";
import {getAuthenticatedClient, uploadShort} from "../utils/google.mts";
import {Job, Worker} from "bullmq";
import type {OutputConfig} from "../types/app";
import {cleanS3} from "../utils/cleanS3.ts";
import {prepareAllVideoAssets} from "../utils/prepareAllVideoAssets.ts";
import {assetsQueue, postingQueue} from "../clients/queues.mts";
import {queueVideoPipeline} from "../utils/queueVideoPipeline.ts";
import type {UploadPlatform} from "../persona_group.mts";

console.log('== Setting up repeatable tasks')
await setupS3CleaningScheduler();
await setupVideoPipelineScheduler('daily-technews-scheduler', '30 23 * * *', 'techV2', 'techguy');
await setupVideoPipelineScheduler('daily-peterlois-scheduler', '30 22 * * *', 'peterLoisPolitics', 'peter');

type AssetsJobData = {
  personaGroupName?: string;
  carryingPersona?: string;
  renderId?: string;
};

console.log('== Creating main app worker')
const worker = new Worker('assets-pipeline', async (job: Job<AssetsJobData>) => {
  if (job.name === 'trigger-video-flow') {
    const {personaGroupName, carryingPersona} = job.data;
    if (!personaGroupName || !carryingPersona) {
      throw new Error('trigger-video-flow: missing personaGroupName or carryingPersona');
    }
    await queueVideoPipeline(personaGroupName, carryingPersona, {automated: true});
    return {...job.data};
  }

  if (job.name === 'generate-assets') {
    await ensureDevelopmentAssets();
    const {personaGroupName, carryingPersona} = job.data;
    if (!personaGroupName || !carryingPersona) {
      throw new Error('generate-assets: missing personaGroupName or carryingPersona');
    }
    const renderData = await prepareAllVideoAssets(personaGroupName, carryingPersona);

    return {renderId: renderData.renderId, fake: false, showProgress: false};
  }

  if (job.name === 'dispatch-uploads') {
    const children = await job.getChildrenValues();
    const values = Object.values(children)[0] as { renderId?: string } | undefined;
    const renderId = values?.renderId;
    if (!renderId) {
      throw new Error('dispatch-uploads: missing renderId from child');
    }

    const configFile = Bun.s3.file(`output/${renderId}/config.json`);
    const config: OutputConfig = await configFile.json();
    const platforms: UploadPlatform[] = config.personae.platforms ?? ['yt'];

    console.log(`== Dispatching uploads for ${renderId} to: ${platforms.join(', ') || '(none)'}`);

    const enqueued: { platform: UploadPlatform; jobId?: string }[] = [];
    for (const platform of platforms) {
      if (platform === 'yt') {
        const j = await assetsQueue.add('upload-to-youtube', { renderId }, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        });
        enqueued.push({ platform, jobId: j.id });
      } else if (platform === 'ig') {
        const j = await postingQueue.add('ig-upload', { renderId }, {
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

  if (job.name === 'upload-to-youtube') {
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
      throw new Error('Upload result is empty')
    }

    console.log(`✅ Upload Successful! ID: ${uploadResult.id}`);
    console.log(`Watch URL: https://youtube.com/shorts/${uploadResult.id}`);
    await job.log(`Watch URL: https://youtube.com/shorts/${uploadResult.id}`);

    return {
      youtubeVideoId: uploadResult.id
    };
  }

  if (job.name === 'clean-s3') {
    await cleanS3();
    console.log("S3 Cleanup complete.");
    return;
  }

  throw new Error('Unknown job: ' + job.name);
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