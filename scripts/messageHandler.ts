import {generateScriptOnTopicForGroup} from "../steps/generate_script.mts";
import {scriptSentencesToSpeechForGroup} from "../steps/tts/tts.ts";
import downloadIllustrations from "../steps/download_illustrations.mts";
import {
  compileAndSaveVideoConfig,
  createOuptutFolder,
  ensureDevelopmentAssets,
} from "../utils/utils.mts";
import {pickAndDownloadSatisfyingVideo} from "../steps/download_satisfying.mts";
import {generateTopic} from "../steps/generate_topic.mts";
import {getPersonaGroup} from "../persona_group.mts";
import {getPersona} from "../personae.mts";
import {getAuthenticatedClient, uploadShort} from "../utils/google.mts";
import {Job, Worker} from "bullmq";
import type {OutputConfig} from "../types/app";
import {cleanS3} from "../utils/cleanS3.ts";

async function prepareAllVideoAssets(personaGroupName: string, personaCarryingConversation: string) {
  const seed = Math.random();
  const personaGroup = getPersonaGroup(personaGroupName);
  const carryingPersona = getPersona(personaCarryingConversation);

  console.log("== Generating topic");
  const topic = await generateTopic(carryingPersona);
  console.log('= Topic: ', topic.topic);

  console.log("== Generating script");
  const sentences = await generateScriptOnTopicForGroup(personaGroup, topic);
  const renderData = await createOuptutFolder();

  console.log(`== Downloading illustrations (${sentences.length} total)`);
  console.log("== Downloading satisfying video");
  console.log("== TTS processing");

  await Promise.all([
    downloadIllustrations(sentences, renderData.folder),
    pickAndDownloadSatisfyingVideo(seed, renderData.folder, personaGroup.satisfyingVideoCategory),
    scriptSentencesToSpeechForGroup(renderData.folder, sentences, personaGroup),
  ]);

  await compileAndSaveVideoConfig(
    seed,
    renderData.folder,
    personaGroup,
    sentences,
    topic,
  );

  return renderData;
}

console.log('== Creating main app worker')
const worker = new Worker('assets-pipeline', async (job: Job<{personaGroupName: string, carryingPersona: string}>) => {
  if (job.name === 'generate-assets') {
    await ensureDevelopmentAssets();
    const { personaGroupName, carryingPersona } = job.data;
    const renderData = await prepareAllVideoAssets(personaGroupName, carryingPersona);

    return { renderId: renderData.renderId, fake: false, showProgress: false };
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
  }

  throw new Error('Unknown job: ' + job.name);
}, {
  connection: { host: process.env.QUEUE_HOST || 'valkey', port: 6379 }
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
