import {generateScriptOnTopicForGroup} from "./steps/generate_script.mts";
import {scriptSentencesToSpeechForGroup} from "./steps/tts/tts.ts";
import downloadIllustrations from "./steps/download_illustrations.mts";
import {
  compileAndSaveVideoConfig,
  createOuptutFolder,
  ensureDevelopmentAssets,
  sendRenderMessage,
} from "./utils/utils.mts";
import {pickAndDownloadSatisfyingVideo} from "./steps/download_satisfying.mts";
import {generateTopic} from "./steps/generate_topic.mts";
import {getPersonaGroup} from "./persona_group.mts";
import {getPersona} from "./personae.mts";
import {remotionRenderQueueEvents, videoQueue} from "./clients/queues.mts";
import {getAuthenticatedClient, uploadShort} from "./utils/google.mts";

async function fullPipelineForOneVideo(personaGroupName: string, personaCarryingConversation: string) {
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

  console.log(`== Queuing render (${renderData.renderId})`);
  const job = await sendRenderMessage(renderData.renderId, {showProgress: process.env.DEBUG !== 'false'});

  console.log("== Waiting for render to complete");
  try {
    await job.waitUntilFinished(remotionRenderQueueEvents);
  } catch (e) {
    console.error("== Render job failed", e);
    return;
  }

  console.log("== Uploading to Youtube");
  const googleCredentials = await getAuthenticatedClient(personaGroup.channelId);
  await uploadShort(
    topic.videoMetadata,
    googleCredentials,
    "output/" + renderData.renderId + "/render.mp4",
  );

  console.log("== Closing queue and exiting");
  await videoQueue.close();
  await remotionRenderQueueEvents.close();
  process.exit(0);
}

await ensureDevelopmentAssets();

const personaGroupName = process.argv[2] || process.env.DEFAULT_PERSONA_GROUP;
if (!personaGroupName) {
  console.log(process.argv);
  throw new Error('Missing personaGroupName');
}

const carryingPersona = process.argv[3] || process.env.DEFAULT_CARRYING_PERSONA;
if (!carryingPersona) {
  console.log(process.argv);
  throw new Error('Missing carryingPersona');
}

await fullPipelineForOneVideo(personaGroupName, carryingPersona);
