import type {ScriptSentence} from "../../types/app";
import type {PersonaConfig} from "../../personae.mts";
import {forceAlign, transcribeAudio} from "./transcriber.ts";

const URL = "https://hadadxyz-pocket-tts-hf-cpu-optimized.hf.space/v1/audio/speech";
const URL_CLONE = "https://hadadxyz-pocket-tts-hf-cpu-optimized.hf.space/v1/audio/speech/clone";

export async function sentenceToSpeechPocket(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig,
) {
  if (persona.pocketUseVoiceSample) {
    return await cloneVoice(sentence, folderName, sentenceId, persona);
  }

  return await presetVoice(sentence, folderName, sentenceId, persona);
}

async function cloneVoice(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig,
) {
  if (typeof persona.pocketUseVoiceSample === 'boolean') {
    persona.pocketUseVoiceSample = await Bun.s3.file('personae/' + (persona.assetId ?? persona.id) + '/voiceSample.mp3').arrayBuffer();
  }

  const formData = new FormData();

  formData.append('input_text', sentence.sentence);
  formData.append('response_format', 'wav');
  formData.append('temperature', '0.7');
  formData.append('lsd_decode_steps', '1');
  formData.append('eos_threshold', '-4');
  formData.append('voice_file', new Blob([persona.pocketUseVoiceSample]), 'voiceSample.mp3');

  const response = await fetch(URL_CLONE, {
    method: "POST",
    body: formData
  });

  await alignAndCleanAndSave(sentenceId, response, sentence, folderName);
}

async function presetVoice(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig,
) {
  const payload = {
    model: "pocket-tts",
    input: sentence.sentence,
    voice: persona.pocketVoiceId,
    temperature: 0.7,
    lsd_decode_steps: 1,
    eos_threshold: -4,
    // frames_after_eos: 10 // unset = auto
  };

  const response = await fetch(URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });

  await alignAndCleanAndSave(sentenceId, response, sentence, folderName);
}

async function alignAndCleanAndSave(sentenceId: string, response: Response, sentence: ScriptSentence, folderName: string) {
  if (!response.ok) {
    console.error("Failed:", await response.text());
    throw new Error('Failed to TTS');
  }

  const tempPath = `/tmp/temp_${sentenceId}_${crypto.randomUUID()}.ogg`;
  await Bun.write(tempPath, response);

  const alignmentData = await transcribeAudio(tempPath);
  const formattedAsr = (alignmentData.alignment.chunks || []).map(s => {
    const start = s.timestamp[0];
    const end = s.timestamp[1];

    return {
      start: Math.min(start, alignmentData.duration),
      end: Math.min(end, alignmentData.duration),
      text: s.text.trim()
    };
  });
  sentence.wordsAlignment = forceAlign(formattedAsr, sentence.sentence.split(' '), alignmentData.duration);

  if (!sentence.wordsAlignment.length) {
    throw new Error('Failed to word align');
  }

  const audioFilePath = `${folderName}/sentence_${sentenceId}.ogg`;
  const tempFile = Bun.file(tempPath);
  await Bun.s3.write(audioFilePath, tempFile);
  await tempFile.unlink();
}