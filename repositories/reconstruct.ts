import type { DistributionConfig } from "../distribution.mts";
import type { PersonaGroupConfig } from "../persona_group.mts";
import type { PersonaConfig } from "../personae.mts";
import type { ShowConfig, ShowLocation, SplitStrategy } from "../show.mts";
import {
	renderScriptGuidelines,
	renderVideoMetaGivenNews,
} from "./promptTemplates.ts";

/**
 * Rebuild a DB row into the exact runtime config types the app already consumes,
 * including live closures for the two prompt functions (from their Eta
 * templates). Identical shapes mean every existing call site keeps working.
 */

// biome-ignore lint/suspicious/noExplicitAny: rows are dynamic SQL results.
type Row = Record<string, any>;

/** Postgres `numeric` comes back as a string (precision-safe); coerce to number. */
const num = (v: unknown): number => Number(v);

/** jsonb may arrive parsed (object) or as text depending on the driver path. */
function parseJson<T>(v: unknown): T {
	return typeof v === "string" ? (JSON.parse(v) as T) : (v as T);
}

export function rowToPersonaConfig(row: Row): PersonaConfig {
	const promptPersonality: string = row.prompt_personality;
	const metaTemplate: string = row.prompt_video_meta_given_news_tmpl;
	const guideTemplate: string = row.prompt_script_guidelines_tmpl;
	return {
		id: row.persona_key,
		assetId: row.asset_id ?? undefined,
		size: num(row.size),
		posXRange: num(row.pos_x_range),
		posXOffset: num(row.pos_x_offset),
		groupPosXRange: num(row.group_pos_x_range),
		groupPosXOffset: num(row.group_pos_x_offset),
		mirrorable: Boolean(row.mirrorable),
		personaName: row.persona_name,
		theme: row.theme,
		themeVolume: num(row.theme_volume),
		themes: parseJson<string[]>(row.themes ?? "[]"),
		language: row.language as PersonaConfig["language"],
		promptPersonality,
		promptVideoMeta: row.prompt_video_meta,
		promptVideoMetaGivenNews: (newsItem) =>
			renderVideoMetaGivenNews(metaTemplate, newsItem, promptPersonality),
		promptScriptGuidelines: (topic) =>
			renderScriptGuidelines(guideTemplate, topic, promptPersonality),
		stances: parseJson(row.stances),
		ttsProvider: row.tts_provider as PersonaConfig["ttsProvider"],
		elevenLabsVoiceId: row.elevenlabs_voice_id,
		kokoroVoiceId: row.kokoro_voice_id,
		kokoroLanguage: row.kokoro_language,
		qwenVoiceId: row.qwen_voice_id,
		pocketVoiceId: row.pocket_voice_id,
		pocketUseVoiceSample: row.pocket_use_voice_sample,
		newsRegion: row.news_region,
		// text[] column → already a JS array from the driver.
		newsTopics: row.news_topics as PersonaConfig["newsTopics"],
		ytCategoryCode: row.yt_category_code,
		stanceDefaultPrompt: row.stance_default_prompt ?? "",
	};
}

function distributionFromRow(row: Row): DistributionConfig {
	return {
		channelId: row.channel_id,
		platforms: row.platforms,
		theme: row.theme,
		themeVolume: num(row.theme_volume),
		themes: parseJson<string[]>(row.themes ?? "[]"),
		satisfyingVideoCategory:
			row.satisfying_video_category as DistributionConfig["satisfyingVideoCategory"],
		endPaddingDurationMs: num(row.end_padding_duration_ms),
	};
}

export function rowToGroupConfig(
	row: Row,
	personae: PersonaConfig[],
): PersonaGroupConfig {
	return {
		...distributionFromRow(row),
		prompt: row.prompt,
		personae,
	};
}

export function rowToShowConfig(
	row: Row,
	roster: PersonaConfig[],
	locationRows: Row[] = [],
): ShowConfig {
	return {
		...distributionFromRow(row),
		id: row.show_key,
		status: (row.status ?? "draft") as ShowConfig["status"],
		prose: row.prose,
		prompt: row.prompt,
		roster,
		locations: locationRows.map(rowToShowLocation),
		split: parseJson<SplitStrategy>(row.split),
		maxCastPerEpisode: num(row.max_cast_per_episode),
		ytCategoryCode: row.yt_category_code,
	};
}

function rowToShowLocation(row: Row): ShowLocation {
	return {
		key: row.location_key,
		name: row.name,
		description: row.description,
		assetKind: (row.asset_kind ?? undefined) as ShowLocation["assetKind"],
		assetExt: row.asset_ext ?? undefined,
	};
}
