import {getPersonaGroup} from "../persona_group.mts";
import {getPersona} from "../personae.mts";
import {generateTopic} from "../steps/generate_topic.mts";
import {generateScriptOnTopicForGroup} from "../steps/generate_script.mts";
import {compileAndSaveVideoConfig, createOuptutFolder} from "./utils.mts";
import downloadIllustrations from "../steps/download_illustrations.mts";
import {pickAndDownloadSatisfyingVideo} from "../steps/download_satisfying.mts";
import {scriptSentencesToSpeechForGroup} from "../steps/tts/tts.ts";

export async function prepareAllVideoAssets(personaGroupName: string, personaCarryingConversation: string) {
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