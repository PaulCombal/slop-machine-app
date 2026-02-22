import { generateScriptOnTopicForGroup } from "./steps/generate_script.mts";
import { scriptSentencesToSpeechForGroup } from "./steps/tts.mts";
import downloadIllustrations from "./steps/download_illustrations.mts";
import {
	createOuptutFolder,
	compileAndSaveVideoConfig,
	sendRenderMessage,
	ensureDevelopmentAssets,
} from "./utils/utils.mts";
import { getAuthenticatedClient, uploadShort } from "./utils/google.mts";
import { remotionRenderQueueEvents, videoQueue } from "./clients/queues.mts";
import { pickAndDownloadSatisfyingVideo } from "./steps/download_satisfying.mts";
import {generateTopic} from "./steps/generate_topic.mts";
import { getPersonaGroup } from "./persona_group.mts";
import {getPersona} from "./personae.mts";

async function fullPipelineForOneVideo(personaGroupName: string, personaCarryingConversation: string) {
	const seed = Math.random();
	const personaGroup = getPersonaGroup(personaGroupName);
	const carryingPersona = getPersona(personaCarryingConversation);

	console.log("== Generating topic");
	const topic = await generateTopic(carryingPersona);
	console.log('= Topic: ', topic.topic);

	// const topic: FullTopicContext = {
	// 	topic: "Trump wants to make Canada the 51st US state",
	// 	latestNews: [],
	// 	videoMetadata: {
	// 		description: "Trump threatens to make moves to get a hold of Canada.",
	// 		title: "Trump wants Canada!",
	// 		hashtags: ["#Canada", "#Trump"],
	// 	},
	// };

	console.log("== Generating script");
	const sentences = await generateScriptOnTopicForGroup(personaGroup, topic);
	const folder = await createOuptutFolder();

	console.log(`== Downloading illustrations (${sentences.length} total)`);
	console.log("== Downloading satisfying video");
	console.log("== TTS processing");

	const tasks = [
		downloadIllustrations(sentences, folder),
		pickAndDownloadSatisfyingVideo(seed, folder),
		scriptSentencesToSpeechForGroup(folder, sentences, personaGroup),
	] as const;

	await Promise.all(tasks);

	await compileAndSaveVideoConfig(
		seed,
		folder,
		personaGroup,
		sentences,
		topic,
	);

	console.log(`== Queuing render (${folder})`);
	const job = await sendRenderMessage(folder, {showProgress: process.env.DEBUG !== 'false'});

	console.log("== Waiting for render to complete");
	try {
		await job.waitUntilFinished(remotionRenderQueueEvents);
	} catch (e) {
		console.error("== Render job failed", e);
		return;
	}

	// console.log("== Uploading to Youtube");
	// const googleCredentials = await getAuthenticatedClient();
	// await uploadShort(
	// 	topic.videoMetadata,
	// 	googleCredentials,
	// 	folder + "/render.mp4",
	// );

	// if (process.env.DEBUG !== "false") {
		console.log("== Debug mode, closing queue and exiting");
		await videoQueue.close();
		await remotionRenderQueueEvents.close();
	// }
}

await ensureDevelopmentAssets();
await fullPipelineForOneVideo("redneckBffDebug", "redneck");
