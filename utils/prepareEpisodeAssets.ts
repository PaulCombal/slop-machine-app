import { episodeGroupFromShow, getShow, type ShowConfig } from "../show.mts";
import { loadManifest } from "./seriesManifest.ts";
import {
	addIllustrationLink,
	addPersonaPositionToSentences,
} from "../steps/generate_script.mts";
import {
	compileAndSaveVideoConfig,
	loadOrCreatePlan,
	outputFolder,
} from "./utils.mts";
import downloadIllustrations from "../steps/download_illustrations.mts";
import { pickAndDownloadSatisfyingVideo } from "../steps/download_satisfying.mts";
import { scriptSentencesToSpeechForGroup } from "../steps/tts/tts.ts";
import type { FullTopicContext } from "../steps/generate_topic.mts";
import type { EpisodePlan } from "../steps/generate_series.mts";
import type { ScriptSentence } from "../types/app";

type EpisodeAssetPlan = {
	seed: number;
	topic: FullTopicContext;
	sentences: ScriptSentence[];
};

function episodePlanToTopic(
	episode: EpisodePlan,
	show: ShowConfig,
): FullTopicContext {
	return {
		latestNews: [],
		category: show.ytCategoryCode,
		topic: episode.title,
		videoMetadata: {
			title: `Ep ${episode.index + 1}: ${episode.title}`,
			description: episode.description,
			hashtags: episode.hashtags,
		},
	};
}

/**
 * Produce all assets for ONE episode, then write the same config.json the
 * render/upload pipeline already consumes. Everything below the plan is the
 * existing pipeline; the only Show-specific work is building the per-episode
 * sub-group and topic. A stable renderId makes the whole thing resumable.
 */
export async function prepareEpisodeAssets(
	showId: string,
	episodeIndex: number,
	renderId: string,
) {
	const show = getShow(showId);
	const manifest = await loadManifest(showId);
	if (!manifest) {
		throw new Error(`No manifest found for show ${showId}`);
	}

	const episode = manifest.episodes[episodeIndex];
	if (!episode) {
		throw new Error(`No episode ${episodeIndex} in show ${showId}`);
	}

	const folder = outputFolder(renderId);
	const group = episodeGroupFromShow(show, episode.cast);

	console.log(`== Episode ${episodeIndex + 1}/${manifest.episodes.length}: ${episode.title}`);
	console.log(`= Cast: ${episode.cast.join(", ")}`);

	// Seed + topic + illustration links are memoized so a retry never re-hits
	// the Pexels search; the script itself already lives in the manifest.
	const plan = await loadOrCreatePlan<EpisodeAssetPlan>(folder, async () => {
		const seed = Math.random();
		const sentences = episode.sentences.map(
			(s): ScriptSentence => ({
				...s,
				wordsAlignment: [],
				posXRange: 0,
				posXOffset: 0,
			}),
		);

		await addIllustrationLink(sentences);
		addPersonaPositionToSentences(sentences, group);

		return { seed, topic: episodePlanToTopic(episode, show), sentences };
	});

	console.log(`== Downloading illustrations (${plan.sentences.length} total)`);
	console.log("== Downloading satisfying video");
	console.log("== TTS processing");

	await Promise.all([
		downloadIllustrations(plan.sentences, folder),
		pickAndDownloadSatisfyingVideo(
			plan.seed,
			folder,
			group.satisfyingVideoCategory,
		),
		scriptSentencesToSpeechForGroup(folder, plan.sentences, group),
	]);

	await compileAndSaveVideoConfig(plan.seed, folder, group, plan.sentences, plan.topic);

	return { renderId, folder };
}
