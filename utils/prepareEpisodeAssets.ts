import { episodeGroupFromShow, getShow, type ShowConfig } from "../show.mts";
import { loadManifest } from "./seriesManifest.ts";
import {
	addIllustrationLink,
	finalizeAppearances,
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
		const sentences = episode.sentences.map((s): ScriptSentence => {
			const speakerStance =
				s.appearances.find((a) => a.personaId === s.speakerId)?.stance ??
				s.appearances[0]!.stance;
			return {
				personaId: s.speakerId,
				appearances: s.appearances.map((a) => ({ ...a })),
				sentence: s.sentence,
				stance: speakerStance,
				illustration: s.illustration,
				locationKey: s.locationKey,
				wordsAlignment: [],
			};
		});

		// Resolve each line's background BEFORE the Pexels pass so room-backed
		// lines are skipped by addIllustrationLink/downloadIllustrations. A line in
		// a location WITH a chosen asset reuses that one file (same path across
		// consecutive same-room lines → the renderer keeps it continuous); anything
		// else falls back to a per-line Pexels clip.
		resolveIllustrations(show, sentences);

		await addIllustrationLink(sentences);
		finalizeAppearances(sentences);

		return { seed, topic: episodePlanToTopic(episode, show), sentences };
	});

	console.log(`== Downloading illustrations (${plan.sentences.length} total)`);
	console.log("== Downloading satisfying video");
	console.log("== TTS processing");

	await Promise.all([
		downloadIllustrations(plan.sentences, folder),
		copyLocationAssets(show, plan.sentences, folder),
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

const LOCATION_CONTENT_TYPE: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
};

/**
 * Point each line at its background file. A line whose location has a chosen
 * asset reuses that single per-room file (so consecutive same-room lines share
 * it and render continuously); everything else gets a per-line Pexels clip.
 */
function resolveIllustrations(show: ShowConfig, sentences: ScriptSentence[]): void {
	const withAsset = new Map(
		show.locations.filter((l) => l.assetKind && l.assetExt).map((l) => [l.key, l]),
	);
	sentences.forEach((s, i) => {
		const loc = s.locationKey ? withAsset.get(s.locationKey) : undefined;
		if (loc) {
			s.illustrationRoom = true;
			s.illustrationKind = loc.assetKind;
			s.illustrationFile = `location_${loc.key}.${loc.assetExt}`;
		} else {
			s.illustrationKind = "video";
			s.illustrationFile = `sentence_${i + 1}_illustration.mp4`;
		}
	});
}

/** Copy each distinct room background used this episode into the render folder. */
async function copyLocationAssets(
	show: ShowConfig,
	sentences: ScriptSentence[],
	folder: string,
): Promise<void> {
	const used = new Map<string, { key: string; assetExt: string }>();
	for (const s of sentences) {
		if (!s.illustrationRoom || !s.locationKey) continue;
		const loc = show.locations.find((l) => l.key === s.locationKey);
		if (loc?.assetExt) used.set(loc.key, { key: loc.key, assetExt: loc.assetExt });
	}
	await Promise.all(
		[...used.values()].map(async (loc) => {
			const dest = `${folder}/location_${loc.key}.${loc.assetExt}`;
			if (await Bun.s3.exists(dest)) return;
			const src = `locations/${show.id}/${loc.key}.${loc.assetExt}`;
			const bytes = new Uint8Array(await Bun.s3.file(src).arrayBuffer());
			await Bun.s3.write(dest, bytes, {
				type: LOCATION_CONTENT_TYPE[loc.assetExt.toLowerCase()] ?? "application/octet-stream",
			});
		}),
	);
}
