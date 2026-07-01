import type { SatisfyingVideoCategory } from "./steps/download_satisfying.mts";

export type UploadPlatform = "yt" | "ig" | "tt";

/**
 * Everything about WHERE/HOW a video is published and dressed, independent of
 * who is in it. Shared by PersonaGroupConfig (news pipeline) and ShowConfig
 * (multi-episode series) so the fields are defined in exactly one place.
 */
export type DistributionConfig = {
	channelId: string;
	platforms: UploadPlatform[];
	/** Base background track; plays on any line the writer leaves un-themed. */
	theme: string;
	themeVolume: number;
	/**
	 * The palette of theme keys the scriptwriter may switch to per sentence
	 * (a curated subset of the theme library). Empty/absent = only the base
	 * `theme`. Optional so legacy code-defined configs don't have to set it; the
	 * DB path always supplies an array.
	 */
	themes?: string[];
	satisfyingVideoCategory: SatisfyingVideoCategory;
	endPaddingDurationMs: number;
};

/** Copy just the distribution fields off any config that embeds them. */
export function pickDistribution(d: DistributionConfig): DistributionConfig {
	return {
		channelId: d.channelId,
		platforms: d.platforms,
		theme: d.theme,
		themeVolume: d.themeVolume,
		themes: d.themes,
		satisfyingVideoCategory: d.satisfyingVideoCategory,
		endPaddingDurationMs: d.endPaddingDurationMs,
	};
}
