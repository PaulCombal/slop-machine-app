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
	theme: string;
	themeVolume: number;
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
		satisfyingVideoCategory: d.satisfyingVideoCategory,
		endPaddingDurationMs: d.endPaddingDurationMs,
	};
}
