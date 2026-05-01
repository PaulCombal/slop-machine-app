import {ensureDevelopmentAssets} from "../utils/utils.mts";
import {getAuthenticatedClient, uploadShort} from "../utils/google.mts";
import {Job, Worker} from "bullmq";
import type {OutputConfig} from "../types/app";
import {cleanS3} from "../utils/cleanS3.ts";
import {prepareAllVideoAssets} from "../utils/prepareAllVideoAssets.ts";
import {assetsQueue} from "../clients/queues.mts";
import {queueVideoPipeline} from "../utils/queueVideoPipeline.ts";

console.log('== Setting up repeatable tasks')
await setupS3CleaningScheduler();
await setupDailyTechNewsScheduler();

console.log('== Creating main app worker')
const worker = new Worker('assets-pipeline', async (job: Job<{
  personaGroupName: string,
  carryingPersona: string
}>) => {
  if (job.name === 'trigger-video-flow') {
    await queueVideoPipeline(job.data.personaGroupName, job.data.carryingPersona, true);
    return {...job.data};
  }

  if (job.name === 'generate-assets') {
    await ensureDevelopmentAssets();
    const {personaGroupName, carryingPersona} = job.data;
    const renderData = await prepareAllVideoAssets(personaGroupName, carryingPersona);

    return {renderId: renderData.renderId, fake: false, showProgress: false};
  }

  if (job.name === 'upload-to-youtube') {
    console.log("== Uploading to Youtube");

    const children = await job.getChildrenValues();
    const values = Object.values(children)[0];
    const renderId = values.renderId;
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

async function setupDailyTechNewsScheduler() {
  const SCHEDULER_ID = 'daily-technews-scheduler';

  await assetsQueue.upsertJobScheduler(
    SCHEDULER_ID,
    {
      pattern: '30 23 * * *',
    },
    {
      name: 'trigger-video-flow',
      data: {
        personaGroupName: 'techNormal',
        carryingPersona: 'techguy'
      },
    }
  );
}
