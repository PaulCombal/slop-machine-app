import { generateScript } from "./steps/generate_script.mts";
import { scriptSentencesToSpeech } from "./steps/tts.mts";
import { getPersona } from "./personae.mts";
import downloadIllustrations from "./steps/download_illustrations.mts";
import {
	createOuptutFolder,
	compileAndSaveVideoConfig,
	sendRenderMessage, ensureDevelopmentAssets,
} from "./utils/utils.mts";
import { getAuthenticatedClient, uploadShort } from "./utils/google.mts";
import { remotionRenderQueueEvents, videoQueue } from "./clients/queues.mts";
import {pickAndDownloadSatisfyingVideo} from "./steps/download_satisfying.mts";

async function fullPipelineForOneVideo() {
	const seed = Math.random();
	const persona = getPersona("debug");

	console.log("== Generating script");
	const sentences = await generateScript(persona);
	const folder = await createOuptutFolder();

	console.log(`== Downloading illustrations (${sentences.length} total)`);
	console.log("== Downloading satisfying video");
	console.log("== TTS processing");

	const tasks = [
		downloadIllustrations(sentences, folder),
		pickAndDownloadSatisfyingVideo(seed, folder),
		scriptSentencesToSpeech(folder, sentences, persona),
	] as const;

	const results = await Promise.all(tasks);
	const satisfyingVideoPath = results[1];

	console.log(`== Queuing render (${folder})`);
	await compileAndSaveVideoConfig(seed, folder, persona, sentences, satisfyingVideoPath);
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

await ensureDevelopmentAssets();
await fullPipelineForOneVideo();
// const personaName = 'debug';
// const personaSourcePrefix = `personae/${personaName}/`;
// console.log(`👤 Syncing persona [${personaName}] from S3 to }...`);
// const s3Objects = await Bun.s3.list({ prefix: 'output' });
// console.log(s3Objects)