import type { PersonaConfig } from "./personae.mts";
import type { PersonaGroupConfig } from "./persona_group.mts";
import type { DistributionConfig } from "./distribution.mts";
import { pickDistribution } from "./distribution.mts";
import { secretStoryDebug } from "./show/secretStoryDebug.ts";
import {
	getShowFromCache,
	listShowsFromCache,
} from "./repositories/registryCache.ts";

/**
 * How a long prose script is sliced into episodes.
 * Only "episodeCount" is implemented for now; the others are placeholders
 * so the breakdown step can fail loudly until they are built.
 */
export type SplitStrategy =
	| { type: "episodeCount"; count: number }
	| { type: "wordBudget"; wordsPerEpisode: number }
	| { type: "length"; targetSeconds: number };

/**
 * A Show turns ONE long prose script (e.g. a reality-TV synopsis) into a
 * SERIES of shorts. It carries the full cast roster (the writer picks which
 * personae appear in each episode) plus the same distribution settings a
 * PersonaGroupConfig has, so every episode can reuse the existing pipeline.
 */
/**
 * Show lifecycle. `draft` = prose/cast/breakdown settings editable. `breaking_down`
 * = the breakdown job is running. `in_production` = a manifest exists and episodes
 * can be rendered/published. Anything other than `draft` freezes the breakdown
 * inputs (prose, prompt, roster, split, maxCastPerEpisode).
 */
export type ShowStatus = "draft" | "breaking_down" | "in_production";

export const isShowLocked = (s?: ShowStatus): boolean => !!s && s !== "draft";

/**
 * A named place a scene can happen in (kitchen, garden…). The chosen background
 * lives in S3 at `locations/<showKey>/<key>.<assetExt>`; `assetKind` is unset
 * until a background is picked. The breakdown tags each line with a location
 * `key`, and the asset prep resolves it to that line's illustration slot.
 */
export type ShowLocation = {
	key: string;
	name: string;
	description: string;
	assetKind?: "image" | "video";
	assetExt?: string;
};

export type ShowConfig = DistributionConfig & {
	id: string;
	/** Lifecycle state; controls whether the breakdown inputs are editable. */
	status?: ShowStatus;
	/** The raw long script / synopsis the writer breaks into episodes. */
	prose: string;
	/** Optional tone / dynamics guidance for the writer (like group.prompt). */
	prompt?: string;
	/** The full cast the writer may draw from. */
	roster: PersonaConfig[];
	/** Named places a scene can happen in, with their chosen backgrounds. */
	locations: ShowLocation[];
	split: SplitStrategy;
	/** How many personae may appear on-screen in a single episode. */
	maxCastPerEpisode: number;
	/** YouTube category id used for every episode (e.g. "24" = Entertainment). */
	ytCategoryCode: string;
};

/**
 * Code-defined shows. Seed fixtures only (imported by `db/seed.ts`); runtime
 * reads go through the DB-backed registry cache below.
 */
const SEED_SHOWS: Record<string, ShowConfig> = {
	secretStoryDebug,
};

export function listSeedShows(): ShowConfig[] {
	return Object.values(SEED_SHOWS);
}

// Runtime accessors — DB-backed via the registry cache.
export function getShow(id: string): ShowConfig {
	return getShowFromCache(id);
}

export function listShows(): ShowConfig[] {
	return listShowsFromCache();
}

/**
 * Bridge: build the per-episode PersonaGroupConfig the rest of the pipeline
 * already understands. It contains ONLY the personae that speak in this
 * episode plus the show's distribution settings. This is what lets TTS,
 * illustrations, render and upload stay completely untouched.
 */
export function episodeGroupFromShow(
	show: ShowConfig,
	castIds: string[],
): PersonaGroupConfig {
	const personae = show.roster.filter((p) => castIds.includes(p.id));
	if (!personae.length) {
		throw new Error("Episode cast is empty for show " + show.id);
	}

	return {
		...pickDistribution(show),
		prompt: show.prompt ?? "",
		personae,
	};
}
