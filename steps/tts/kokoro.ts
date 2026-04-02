import type {ScriptSentence} from "../../types/app";
import type {PersonaConfig} from "../../personae.mts";
import {Client} from "@gradio/client";

export async function sentenceToSpeechKokoro(
  sentence: ScriptSentence,
  folderName: string,
  sentenceId: string,
  persona: PersonaConfig,
) {
  const client = await Client.connect("PaulCombal/Kokoro-TTS-Subtitle");
  const result = await client.predict<Record<string, any>>("/KOKORO_TTS_API", {
    text: sentence.sentence,
    Language: persona.kokoroLanguage,
    voice: persona.kokoroVoiceId,
    speed: 0.95,
    translate_text: false,
    remove_silence: false,
  });

  const wavUrl = result.data[0].url;
  const srtUrl = result.data[2].url;

  const audioResponse = await fetch(wavUrl);
  const audioFilePath = `${folderName}/sentence_${sentenceId}.ogg`;
  await Bun.s3.write(audioFilePath, audioResponse);

  const srtResponse = await fetch(srtUrl);
  const srtContent = await srtResponse.text();

  sentence.wordsAlignment = parseSrtToWords(srtContent);
}

function parseSrtToWords(srtContent: string) {
  // Regex to capture: [Index] [Start Time] --> [End Time] [Word]
  // The \s+ matches the line breaks between the time and the word
  const srtRegex =
    /\d+\s+(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s+(.*)/g;
  const words = [];
  let match;

  while ((match = srtRegex.exec(srtContent)) !== null) {
    const [_, startTime, endTime, word] = match;

    words.push({
      start: timeToSeconds(startTime!),
      end: timeToSeconds(endTime!),
      text: word!.trim(),
    });
  }

  return words;
}

function timeToSeconds(timeStr: string): number {
  const [hours, minutes, secondsWithMs] = timeStr.split(":");
  const [seconds, milliseconds] = secondsWithMs!.split(",");

  return (
    parseInt(hours!) * 3600 +
    parseInt(minutes!) * 60 +
    parseInt(seconds!) +
    parseInt(milliseconds!) / 1000
  );
}