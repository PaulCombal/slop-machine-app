import { generateScript } from "./steps/generate_script.ts";
import { scriptSentencesToSpeech } from "./steps/tts.ts";
import { getPersona } from "./personae.mts";
import downloadIllustrations from "./steps/download_illustrations.mts";
import {
	createOuptutFolder,
	normalizeAndSaveVideoConfig,
	sendRenderMessage,
} from "./utils/utils.mts";
import { getAuthenticatedClient, uploadShort } from "./utils/google.mts";
import { remotionRenderQueueEvents, videoQueue } from "./clients/queues.mts";

async function fullPipelineForOneVideo() {
	const persona = getPersona("debug");

	console.log("== Generating script");
	const sentences = await generateScript(persona);
	const folder = await createOuptutFolder();

	console.log(`== Downloading illustrations (${sentences.length} total)`);
	await downloadIllustrations(sentences, folder);

	console.log("== TTS processing");
	await scriptSentencesToSpeech(folder, sentences, persona);

	console.log(`== Queuing render (${folder})`);
	await normalizeAndSaveVideoConfig(folder, persona, sentences);
	const job = await sendRenderMessage(folder);

	console.log("== Waiting for render to complete");
	try {
		await job.waitUntilFinished(remotionRenderQueueEvents);
	} catch (e) {
		console.error("== Render job failed", e);
		return;
	}

	console.log("== Uploading to Youtube")
	const googleCredentials = await getAuthenticatedClient();
	await uploadShort(googleCredentials, folder + "/render.mp4");

	if (process.env.DEBUG !== "false") {
		console.log("== Debug mode, closing queue and exiting")
		await videoQueue.close();
		await remotionRenderQueueEvents.close();
	}
}

await fullPipelineForOneVideo();
