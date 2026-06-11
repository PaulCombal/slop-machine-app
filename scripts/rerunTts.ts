import type {OutputConfig} from "../types/app";
import {scriptSentencesToSpeechForGroup} from "../steps/tts/tts.ts";
import {getPersonaGroup} from "../persona_group.mts";
import {ensureDatabaseReady} from "../db/bootstrap.ts";
import {initRegistryCache} from "../repositories/registryCache.ts";

const renderId = process.argv[2];

if (!renderId) {
  console.log(process.argv);
  throw new Error('Missing renderId');
}

// Definitions live in Postgres — load the cache before any getPersonaGroup call.
const admin = await ensureDatabaseReady();
await initRegistryCache(admin.id);

console.log('Rerunning TTS..')
await rerunTts(renderId);
console.log('Done');

async function rerunTts(renderId: string) {
  if (process.env.DEBUG !== "false") {
    console.log("Skipping rerunning TTS in debug mode");
    return null;
  }

  const config: OutputConfig = await Bun.s3.file('output/' + renderId + '/config.json').json();
  await scriptSentencesToSpeechForGroup(`output/${renderId}`, config.sentences, getPersonaGroup('techNormal'))
  console.log('new config', config)
  await Bun.s3.write('output/' + renderId + '/config.json', JSON.stringify(config, null, 2))
}
