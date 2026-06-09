import {getPersonaGroup} from "../persona_group.mts";
import {getPersona} from "../personae.mts";
import {generateTopic, type FullTopicContext} from "../steps/generate_topic.mts";
import {generateScriptOnTopicForGroup} from "../steps/generate_script.mts";
import {compileAndSaveVideoConfig, loadOrCreatePlan, outputFolder} from "./utils.mts";
import downloadIllustrations from "../steps/download_illustrations.mts";
import {pickAndDownloadSatisfyingVideo} from "../steps/download_satisfying.mts";
import {scriptSentencesToSpeechForGroup} from "../steps/tts/tts.ts";
import type {ScriptSentence} from "../types/app";

type VideoPlan = {
  seed: number;
  topic: FullTopicContext;
  sentences: ScriptSentence[];
};

export async function prepareAllVideoAssets(personaGroupName: string, personaCarryingConversation: string, renderId: string) {
  const personaGroup = getPersonaGroup(personaGroupName);
  const carryingPersona = getPersona(personaCarryingConversation);
  const folder = outputFolder(renderId);

  // Topic + script + illustration links are memoized so a retry never re-pays
  // for the LLM or Pexels search.
  const plan = await loadOrCreatePlan<VideoPlan>(folder, async () => {
    const seed = Math.random();

    console.log("== Generating topic");
    const topic = await generateTopic(carryingPersona);
    console.log('= Topic: ', topic.topic);

    console.log("== Generating script");
    const sentences = await generateScriptOnTopicForGroup(personaGroup, topic);

    return {seed, topic, sentences};
  });

  console.log(`== Downloading illustrations (${plan.sentences.length} total)`);
  console.log("== Downloading satisfying video");
  console.log("== TTS processing");

  await Promise.all([
    downloadIllustrations(plan.sentences, folder),
    pickAndDownloadSatisfyingVideo(plan.seed, folder, personaGroup.satisfyingVideoCategory),
    scriptSentencesToSpeechForGroup(folder, plan.sentences, personaGroup),
  ]);

  await compileAndSaveVideoConfig(
    plan.seed,
    folder,
    personaGroup,
    plan.sentences,
    plan.topic,
  );

  return {renderId, folder};
}
