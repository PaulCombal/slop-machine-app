import type {ScriptSentence} from "../../types/app";
import type {PersonaConfig} from "../../personae.mts";
import type {PersonaGroupConfig} from "../../persona_group.mts";
import {sentenceToSpeechElevenlabs} from "./elevenlabs.ts";
import {sentenceToSpeechKokoro} from "./kokoro.ts";
import {sentenceToSpeechQwen} from "./qwen.ts";
import {sentenceToSpeechPocket} from "./pocket.ts";

async function dummy(
  folder: string,
  sentence: ScriptSentence,
  sentenceId: string,
) {
  const sourceFile = Bun.file(`/assets/debug/sentence_${sentenceId}.ogg`);
  await Bun.s3.write(folder + `/sentence_${sentenceId}.ogg`, sourceFile);
  const subsFile = Bun.file(`/assets/debug/sentence_${sentenceId}_subs.json`);
  sentence.wordsAlignment = await subsFile.json();
}

async function sentenceToSpeech(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig,
) {
  const audioKey = `${folderName}/sentence_${sentenceId}.ogg`;
  const alignmentKey = `${folderName}/sentence_${sentenceId}_alignment.json`;

  // Resume: if both the audio and its word alignment already exist, reuse them
  // instead of re-paying the (often metered) TTS provider on a retry.
  if ((await Bun.s3.exists(audioKey)) && (await Bun.s3.exists(alignmentKey))) {
    console.log(`↩️  Skipping existing TTS for sentence ${sentenceId}`);
    sentence.wordsAlignment = await Bun.s3.file(alignmentKey).json();
    return;
  }

  if (process.env.DEBUG !== "false") {
    await dummy(folderName, sentence, sentenceId);
  } else {
    switch (persona.ttsProvider) {
      case "elevenlabs":
        await sentenceToSpeechElevenlabs(sentence, folderName, sentenceId, persona);
        break;
      case 'qwen':
        await sentenceToSpeechQwen(sentence, folderName, sentenceId, persona);
        break;
      case 'pocket':
        await sentenceToSpeechPocket(sentence, folderName, sentenceId, persona);
        break;
      default:
        await sentenceToSpeechKokoro(sentence, folderName, sentenceId, persona);
        break;
    }
  }

  // Persist the alignment so a future retry can resume without the provider.
  await Bun.s3.write(alignmentKey, JSON.stringify(sentence.wordsAlignment));
}

export async function scriptSentencesToSpeech(
  folderName: string,
  sentences: ScriptSentence[],
  persona: PersonaConfig,
): Promise<void> {
  if (process.env.TTS_GENERATION_PARALLEL === "true") {
    const tasks = sentences.map((sentence, index) => {
      return sentenceToSpeech(sentence, folderName, `${index + 1}`, persona);
    });

    await Promise.all(tasks);
  } else {
    for (let i = 0; i < sentences.length; i++) {
      await sentenceToSpeech(sentences[i]!, folderName, `${i + 1}`, persona);
    }
  }
}

export async function scriptSentencesToSpeechForGroup(
  folderName: string,
  sentences: ScriptSentence[],
  personaGroup: PersonaGroupConfig,
): Promise<void> {
  if (process.env.TTS_GENERATION_PARALLEL === "true") {
    const tasks = sentences.map((sentence, index) => {
      const persona = personaGroup.personae.find(
        (p) => p.id === sentence.personaId,
      );
      if (!persona) {
        throw new Error("Persona not found for sentence");
      }
      return sentenceToSpeech(sentence, folderName, `${index + 1}`, persona);
    });

    await Promise.all(tasks);
  } else {
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i]!;
      const persona = personaGroup.personae.find(
        (p) => p.id === sentence.personaId,
      );
      if (!persona) {
        throw new Error("Persona not found for sentence");
      }
      await sentenceToSpeech(sentence, folderName, `${i + 1}`, persona);
    }
  }
}
