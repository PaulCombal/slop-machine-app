import type {OutputConfig, ScriptSentence} from "../types/app";
import type {PersonaConfig} from "../personae.mts";
import {videoQueue} from "../clients/queues.mts";

export async function createOuptutFolder() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replaceAll(':', '-');

  const folderName = `/output/${timestamp}_${crypto.randomUUID().slice(0, 8)}`;
  const { mkdir } = require("node:fs/promises");
  await mkdir(folderName, { recursive: true });

  return folderName;
}

export async function normalizeAndSaveVideoConfig(folder: string, persona: PersonaConfig, sentences: ScriptSentence[]) {
  const outputConfig: OutputConfig = {
    persona,
    sentences
  }

  await Bun.write(folder + '/config.json', JSON.stringify(outputConfig, null, 2));

  return outputConfig;
}

export async function sendRenderMessage(folder: string, andExit: boolean) {
  await videoQueue.add('remotion-render', {
    folderPath: folder,
    outputName: `video-${Date.now()}.mp4`,
  }, {
    attempts: 1,
    backoff: { type: 'exponential', delay: 2000 }
  });

  if (andExit) {
    await videoQueue.close();
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(url: string, fileName: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      console.log(`Fetching ${fileName} (Attempt ${i + 1})...`);

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) throw new Error(`Status: ${response.status}`);

      // If you need to stream to disk (to avoid memory issues with large videos)
      const arrayBuffer = await response.arrayBuffer();
      await Bun.write(fileName, arrayBuffer);

      clearTimeout(timeoutId);
      console.log(`✅ Downloaded: ${fileName}`);
      return; // Success!

    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';

      console.warn(
        `⚠️ ${isTimeout ? 'Timeout' : 'Error'} on ${fileName}. ` +
        (i < retries - 1 ? 'Retrying...' : 'Failed all attempts.')
      );

      if (i === retries - 1) throw err;

      // Wait a bit longer before retrying to appease Pexels
      await sleep(15000 * (i+1));
    }
  }
}