import type {ScriptSentence} from "../../types/app";
import type {PersonaConfig} from "../../personae.mts";
import {Client, handle_file} from "@gradio/client";
import {forceAlign, transcribeAudio} from "./transcriber.ts";

// FLODARELTIH's pocket-tts Space (preset + voice cloning). Override with
// POCKET_TTS_URL (a "owner/space" reference or a full URL) to use your own.
const APP_REFERENCE =
  process.env.POCKET_TTS_URL ?? "FLODARELTIH/pocket-tts-hf-cpu-optimized";

const VOICE_MODE_PRESET = "Preset Voices";
const VOICE_MODE_CLONE = "Voice Cloning";

// Generation knobs passed alongside the voice selection.
const MODEL_VARIANT = "b6369a24";
const LSD_DECODE_STEPS = 1;
const TEMPERATURE = 0.7;
const NOISE_CLAMP = 0;
const EOS_THRESHOLD = -4;
const FRAMES_AFTER_EOS = 10;
const ENABLE_CUSTOM_FRAMES = false;

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

  // The Space validates by extension, so the upload needs a named file.
  const sample = new File([persona.pocketUseVoiceSample], "voiceSample.mp3", {
    type: "audio/mpeg",
  });

  const response = await generateSpeech(sentence.sentence, {
    voice_mode_selection: VOICE_MODE_CLONE,
    voice_preset_selection: persona.pocketVoiceId || "alba",
    voice_clone_audio_file: handle_file(sample),
  });

  await alignAndCleanAndSave(sentenceId, response, sentence, folderName);
}

async function presetVoice(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig,
) {
  const response = await generateSpeech(sentence.sentence, {
    voice_mode_selection: VOICE_MODE_PRESET,
    voice_preset_selection: persona.pocketVoiceId,
    voice_clone_audio_file: null,
  });

  await alignAndCleanAndSave(sentenceId, response, sentence, folderName);
}

/** Call the Gradio speech endpoint and fetch the produced audio file. */
async function generateSpeech(
  text: string,
  voice: Record<string, unknown>,
): Promise<Response> {
  const client = await Client.connect(APP_REFERENCE);
  const result = await client.predict<Record<string, any>>(
    "/perform_speech_generation",
    {
      text_input: text,
      ...voice,
      model_variant: MODEL_VARIANT,
      lsd_decode_steps: LSD_DECODE_STEPS,
      temperature: TEMPERATURE,
      noise_clamp: NOISE_CLAMP,
      eos_threshold: EOS_THRESHOLD,
      frames_after_eos: FRAMES_AFTER_EOS,
      enable_custom_frames: ENABLE_CUSTOM_FRAMES,
    },
  );

  const url = result.data[0]?.url;
  if (!url) {
    throw new Error('Failed to TTS');
  }

  return await fetch(url);
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
