// import { generateScriptOnTopic } from "./steps/generate_script.mts";
// import { scriptSentencesToSpeech } from "./steps/tts.mts";
// import { getPersona } from "./personae.mts";
// import downloadIllustrations from "./steps/download_illustrations.mts";
// import {
// 	createOuptutFolder,
// 	compileAndSaveVideoConfig,
// 	sendRenderMessage,
// 	ensureDevelopmentAssets,
// } from "./utils/utils.mts";
// import { getAuthenticatedClient, uploadShort } from "./utils/google.mts";
// import { remotionRenderQueueEvents, videoQueue } from "./clients/queues.mts";
// import { pickAndDownloadSatisfyingVideo } from "./steps/download_satisfying.mts";
// import { generateTopic } from "./steps/generate_topic.mts";
//
// async function fullPipelineForOneVideo(personaName: string) {
// 	const seed = Math.random();
// 	const persona = getPersona(personaName);
//
// 	console.log("== Generating topic");
// 	const topic = await generateTopic(persona);
//
// 	console.log("== Generating script");
// 	const sentences = await generateScriptOnTopic(persona, topic);
// 	const folder = await createOuptutFolder();
//
// 	console.log(`== Downloading illustrations (${sentences.length} total)`);
// 	console.log("== Downloading satisfying video");
// 	console.log("== TTS processing");
//
// 	const tasks = [
// 		downloadIllustrations(sentences, folder),
// 		pickAndDownloadSatisfyingVideo(seed, folder),
// 		scriptSentencesToSpeech(folder, sentences, persona),
// 	] as const;
//
// 	const results = await Promise.all(tasks);
// 	const satisfyingVideoPath = results[1];
//
// 	console.log(`== Queuing render (${folder})`);
// 	await compileAndSaveVideoConfig(
// 		seed,
// 		folder,
// 		persona,
// 		sentences,
// 		satisfyingVideoPath,
// 		topic,
// 	);
// 	const job = await sendRenderMessage(folder);
//
// 	console.log("== Waiting for render to complete");
// 	try {
// 		await job.waitUntilFinished(remotionRenderQueueEvents);
// 	} catch (e) {
// 		console.error("== Render job failed", e);
// 		return;
// 	}
//
// 	console.log("== Uploading to Youtube");
// 	const googleCredentials = await getAuthenticatedClient();
// 	await uploadShort(
// 		topic.videoMetadata,
// 		googleCredentials,
// 		folder + "/render.mp4",
// 	);
//
// 	if (process.env.DEBUG !== "false") {
// 		console.log("== Debug mode, closing queue and exiting");
// 		await videoQueue.close();
// 		await remotionRenderQueueEvents.close();
// 	}
// }
//
// const personaName = process.argv[2] ?? "razmo";
// await ensureDevelopmentAssets();
// await fullPipelineForOneVideo(personaName);
