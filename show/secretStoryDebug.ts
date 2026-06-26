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
	prose: `Inside the "Secret Story" house, the housemates are on edge. It all starts in the living room, where Lois gathers everyone on the big sofas and announces she suspects there is a hidden room and a secret nobody is supposed to know about. Peter, smug and overconfident, leans on the kitchen counter making breakfast for an audience of nobody, insisting he has already figured everything out and that the production is rigged in his favor. Out in the garden by the pool, an alliance forms and breaks over whispered promises. A mysterious envelope appears one morning on the kitchen table. Late at night someone is caught whispering near the confession booth, the little red-lit room where housemates spill their secrets to the camera. Lois finally sneaks down a narrow corridor and discovers the hidden room behind the bookshelf, crammed with monitors. Back in the bedroom, accusations fly between the bunk beds. A fake eviction is staged at the front door to test loyalty, and in the finale, on the main stage under the studio lights, the buried secret is finally revealed live, leaving everyone stunned.`,
	prompt:
		"Write punchy reality-TV banter with cliffhangers. Each character keeps their personality. Build suspense across episodes; from episode 2 onward, open with a one-line recap and end on a hook.",
	roster: [getSeedPersona("lois"), getSeedPersona("peter")],
	// Locations are authored per-show via the web UI (not seeded in code).
	locations: [],
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
