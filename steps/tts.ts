import type {ScriptSentence} from "../types/app";
import myElevenLabsClient from "../clients/elevenlabs.ts";
import type {CharacterAlignmentResponseModel} from "elevenlabs/api";
import type {PersonaConfig} from "../personae.mts";

function getWordLevelTimestamps(alignment: CharacterAlignmentResponseModel) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const words = [];
  let currentWord = "";
  let startTime = null;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const start = character_start_times_seconds[i];
    const end = character_end_times_seconds[i];

    // Initialize start time for a new word
    if (startTime === null) startTime = start;

    if (char === " ") {
      // If we hit a space, push the current word (if not empty)
      if (currentWord.length > 0) {
        words.push({ text: currentWord, start: startTime, end: character_end_times_seconds[i-1] });
      }
      currentWord = "";
      startTime = null;
    } else {
      currentWord += char;
    }
  }

  // Catch the last word if the text doesn't end in a space
  if (currentWord.length > 0) {
    words.push({ text: currentWord, start: startTime, end: character_end_times_seconds[characters.length - 1] });
  }

  return words;
}

async function dummy(folder: string, sentence: ScriptSentence, sentenceId: string) {
  const sourceFile = Bun.file(`/assets/debug/sentence_${sentenceId}.ogg`);
  await Bun.write(folder + `/sentence_${sentenceId}.ogg`, sourceFile);
  const subsFile = Bun.file(`/assets/debug/sentence_${sentenceId}_subs.json`);
  sentence.wordsAlignment = await subsFile.json();
}

export async function sentenceToSpeech(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig
) {
  if (process.env.DEBUG !== 'false') {
    return await dummy(folderName, sentence, sentenceId);
  }

  const audio = await myElevenLabsClient.textToSpeech.convertWithTimestamps(
    persona.voiceId,
    {
      text: sentence.sentence,
      model_id: "eleven_multilingual_v2",
      output_format: 'opus_48000_96',
      voice_settings: {
        speed: 0.95,
        stability: 0.33,       // Lower stability = more expressive/angry
        similarity_boost: 0.8,
        style: 0.5,            // Higher style = more dramatic
      },
    }
  );

  if (!audio.alignment) {
    throw new Error('NO AUDIO ALIGNMENT!!')
  }

  const audioFilePath = folderName + `/sentence_${sentenceId}.ogg`;
  const audioBuffer = Buffer.from(audio.audio_base64, "base64");

  await Bun.write(audioFilePath, audioBuffer);
  sentence.wordsAlignment = getWordLevelTimestamps(audio.alignment);
}

export async function scriptSentencesToSpeech(sentences: ScriptSentence[], persona: PersonaConfig): Promise<string> {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replaceAll(':', '-');

  const folderName = `/output/${timestamp}_${crypto.randomUUID().slice(0, 8)}`;
  const { mkdir } = require("node:fs/promises");
  await mkdir(folderName, { recursive: true });

  const tasks = sentences.map((sentence, index) => {
    return sentenceToSpeech(sentence, folderName, `${index + 1}`, persona);
  });

  await Promise.all(tasks);

  return folderName;
}