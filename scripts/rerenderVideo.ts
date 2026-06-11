import type {OutputConfig} from "../types/app";
import {scriptSentencesToSpeechForGroup} from "../steps/tts/tts.ts";
import {getPersonaGroup} from "../persona_group.mts";
import {sendRenderMessage} from "../utils/utils.mts";
import {remotionRenderQueueEvents, renderQueue} from "../clients/queues.mts";
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

console.log('Rerendering video..')
await rerenderVideo(renderId);
console.log('Done');

async function rerenderVideo(renderId: string) {
  if (process.env.DEBUG !== "false" || process.env.SKIP_YT_UPLOAD) {
    console.log("Skipping rerendering in debug mode");
    return null;
  }

  console.log(`== Queuing render (${renderId})`);
  const job = await sendRenderMessage(renderId, {showProgress: true, fake: false});

  console.log("== Waiting for render to complete");
  try {
    await job.waitUntilFinished(remotionRenderQueueEvents);
  } catch (e) {
    console.error("== Render job failed", e);
    return;
  }

  console.log("== Debug mode, closing queue and exiting");
  await renderQueue.close();
  await remotionRenderQueueEvents.close();
}
