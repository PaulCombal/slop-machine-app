import {generateScript} from "./steps/generate_script.ts";
import {scriptSentencesToSpeech} from "./steps/tts.ts";
import {getPersona} from "./personae.mts";
import downloadIllustrations from "./steps/download_illustrations.mts";
import type {OutputConfig} from "./types/app";
import {videoQueue} from "./clients/queues.mts";

const persona = getPersona('debug');
const sentences = await generateScript(persona);
const folder = await scriptSentencesToSpeech(sentences, persona);
await downloadIllustrations(sentences, folder);

const outputConfig: OutputConfig = {
  persona,
  sentences
}

await Bun.write(folder + '/config.json', JSON.stringify(outputConfig, null, 2));

await videoQueue.add('remotion-render', {
  folderPath: folder,
  outputName: `video-${Date.now()}.mp4`,
  config: outputConfig
}, {
  attempts: 1,
  backoff: { type: 'exponential', delay: 2000 }
});
await videoQueue.close();