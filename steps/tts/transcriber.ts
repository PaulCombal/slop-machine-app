import {type AutomaticSpeechRecognitionOutput, pipeline} from '@xenova/transformers';
import {unlink} from "node:fs/promises";
import {spawnSync} from "node:child_process";

function decodeAudio(filePath: string): Float32Array {
  // We tell ffmpeg to output raw f32le (float 32-bit little endian) at 16000Hz mono
  const { stdout, stderr, status } = spawnSync('ffmpeg', [
    '-i', filePath,
    '-f', 'f32le',
    '-acodec', 'pcm_f32le',
    '-ar', '16000',
    '-ac', '1',
    'pipe:1'
  ]);

  if (status !== 0) {
    throw new Error(`FFmpeg failed: ${stderr.toString()}`);
  }

  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
}

export async function transcribeAudio(wavPath: string) {
  const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  const audioData = decodeAudio(wavPath);
  const duration = audioData.length / 16000
  const alignment = await transcriber(audioData, {
    return_timestamps: 'word',
  }) as AutomaticSpeechRecognitionOutput;

  return { alignment, duration };
}

type AlignmentFmt = {
  start: number | null | undefined;
  end: number | undefined;
  text: string;
};

export function forceAlign(
  whisperWords: AlignmentFmt[],
  correctWords: string[]
): AlignmentFmt[] {
  const aligned: AlignmentFmt[] = [];
  let whisperIdx = 0;

  for (let i = 0; i < correctWords.length; i++) {
    const target = correctWords[i]!.toLowerCase().replace(/[.,!?;]/g, "");
    let foundMatch = false;

    for (let lookAhead = 0; lookAhead < 10; lookAhead++) {
      const currentWhisperIdx = whisperIdx + lookAhead;
      if (currentWhisperIdx >= whisperWords.length) break;

      const whisperSegment = whisperWords[currentWhisperIdx]!;
      const whisperText = whisperSegment.text.toLowerCase().replace(/[.,!?;]/g, "");

      if (target === whisperText) {
        const prevEnd = aligned.length > 0 ? aligned[aligned.length - 1]!.end ?? 0 : 0;
        const originalStart = whisperSegment.start ?? 0;

        // Logic: If Whisper's start time is earlier than the previous word's end, we realign it.
        const actualStart = Math.max(originalStart, prevEnd);
        const actualEnd = Math.max(whisperSegment.end ?? 0, actualStart + 0.05);

        if (originalStart < prevEnd) {
          console.log(
            `[Realign] Timing overlap fixed for "${correctWords[i]}": ` +
            `OG start ${originalStart}s -> New start ${actualStart}s`
          );
        }

        aligned.push({
          start: actualStart,
          end: actualEnd,
          text: correctWords[i]!,
        });

        whisperIdx = currentWhisperIdx + 1;
        foundMatch = true;
        break;
      }
    }

    // 2. Interpolation Logic (No match found)
    if (!foundMatch) {
      const prevEnd = aligned.length > 0 ? aligned[aligned.length - 1]!.end ?? 0 : 0;
      const currentWhisper = whisperWords[whisperIdx];

      let duration = 0.3;
      if (currentWhisper && currentWhisper.end && currentWhisper.start !== undefined) {
        duration = Math.max(currentWhisper.end - (currentWhisper.start ?? 0), 0.1);
      }

      console.log(
        `[Mismatch] Ground truth "${correctWords[i]}" not found in Whisper window. ` +
        `Interpolating at ${prevEnd}s (Duration: ${duration.toFixed(2)}s)`
      );

      aligned.push({
        start: prevEnd,
        end: prevEnd + duration,
        text: correctWords[i]!,
      });

      if (whisperIdx < whisperWords.length) {
        whisperIdx++;
      }
    }
  }

  return aligned;
}