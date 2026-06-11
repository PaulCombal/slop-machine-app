import { getSeedPersona } from "../personae.mts";
import type { ShowConfig } from "../show.mts";

/**
 * Example "reality TV" show. The prose below is a synopsis; the writer step
 * breaks it into episodes and decides which personae appear in each one.
 *
 * It reuses existing personae (lois, peter) so the DEBUG dummy assets resolve.
 */
export const secretStoryDebug: ShowConfig = {
	id: "secretStoryDebug",
	prose: `Inside the "Secret Story" house, the housemates are on edge. Lois suspects there is a hidden room and a secret nobody is supposed to know about. Peter, smug and overconfident, insists he has already figured everything out and that the production is rigged in his favor. Tension builds over several days: a mysterious envelope appears, an alliance forms and breaks, and someone is caught whispering near the confession booth. Accusations fly, a fake eviction is staged to test loyalty, and in the finale the buried secret is finally revealed live, leaving everyone stunned.`,
	prompt:
		"Write punchy reality-TV banter with cliffhangers. Each character keeps their personality. Build suspense across episodes; from episode 2 onward, open with a one-line recap and end on a hook.",
	roster: [getSeedPersona("lois"), getSeedPersona("peter")],
	split: { type: "episodeCount", count: 3 },
	maxCastPerEpisode: 2,

	channelId: "peterRazmo",
	platforms: ["yt"],
	theme: "debug",
	themeVolume: 0.05,
	satisfyingVideoCategory: "america",
	endPaddingDurationMs: 500,
	ytCategoryCode: "24", // Entertainment
};
