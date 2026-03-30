import type {ScriptSentence} from "../../types/app";
import type {PersonaConfig} from "../../personae.mts";
import {Client, handle_file} from "@gradio/client";
import {gradioClient} from "../../clients/gradio.ts";

export async function sentenceToSpeechQwen(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig,
) {
  console.log('entering qwen TTS func')
  // const ttsClient = await gradioClient("Qwen/Qwen3-TTS");
  const ttsClient = await Client.connect("Qwen/Qwen3-TTS");
  const ttsSubmission = ttsClient.submit("/generate_custom_voice", {
    text: sentence.sentence,
    language: "English",
    speaker: persona.qwenVoiceId,
    instruct: "",
  });

  let wavUrl = "";

  console.log('listening to tts messages...', new Date())
  for await (const msg of ttsSubmission) {
    console.log('msg', msg);

    if (msg.type === "status") {
      const { stage, position, eta } = msg;
      if (stage === "pending") {
        console.log(`⏳ TTS Queue Pos: ${position} (ETA: ${eta?.toFixed(1)}s)`);
      }
    }

    if (msg.type === "data") {
      // @ts-ignore - Qwen3-TTS returns the audio object in data[0]
      wavUrl = msg.data[0].url;
      break;
    }
  }

  try {
    await ttsSubmission.cancel();
  }
  catch {
    console.log('Failed to cancel tts submission')
  }

  if (!wavUrl) throw new Error("TTS failed to return a URL");

  console.log('fetching wav...', new Date());
  const audioResponse = await fetch(wavUrl);
  const audioBlob = await audioResponse.blob();
  const audioFilePath = `${folderName}/sentence_${sentenceId}.ogg`;
  await Bun.s3.write(audioFilePath, audioResponse);

  console.log("connecting to Qwen3-ASR for timestamps...");
  const asrClient = await gradioClient("Qwen/Qwen3-ASR");

  const submission = asrClient.submit("/transcribe", {
    audio_upload: handle_file(audioBlob),
    lang_disp: "English",
    return_ts: true,
  });

  // Wait for the final result
  let language;
  let timestamps;
  for await (const msg of submission) {
    console.log('msg', msg)
    if (msg.type === "data") {
      // const timestampsJson = msg.data[2];
      // sentence.wordsAlignment = timestampsJson;
      console.log("✅ Timestamps received via websocket");
      language = msg.data[0];
      timestamps = msg.data[2] as {text: string; start_time: number; end_time: number;}[];
      break;
    }

    if (msg.type === "status") {
      const { stage, position, eta } = msg;

      if (stage === "pending") {
        console.log(`⏳ In Queue: ${position} (Est. wait: ${eta?.toFixed(1)}s)`);
      } else if (stage === "generating") {
        console.log("🎙️ Qwen is transcribing your audio now...");
      } else if (stage === "error") {
        throw new Error(`ASR Queue Error: ${msg.message}`);
      }
    }
  }

  try {
    await submission.cancel();
  }
  catch {
    console.log('Failed to cancel asr submission')
  }

  sentence.wordsAlignment = timestamps!.map(qt => ({
    text: qt.text,
    start: qt.start_time,
    end: qt.end_time
  }))
}