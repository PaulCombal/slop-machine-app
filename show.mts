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
export type ShowConfig = DistributionConfig & {
	id: string;
	/** The raw long script / synopsis the writer breaks into episodes. */
	prose: string;
	/** Optional tone / dynamics guidance for the writer (like group.prompt). */
	prompt?: string;
	/** The full cast the writer may draw from. */
	roster: PersonaConfig[];
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
