import { z } from "zod";
import type { ShowConfig } from "../show.mts";
import type { Slot } from "../types/app";
import { promptLlmObject } from "../utils/llm.mts";

export type EpisodePlanAppearance = {
	personaId: string;
	stance: string;
	slot: Slot;
};

export type EpisodePlanSentence = {
	speakerId: string;
	appearances: EpisodePlanAppearance[];
	sentence: string;
	illustration: string;
	/** Key of the show location this line happens in, if any (else Pexels). */
	locationKey?: string;
	/** Mood theme that starts on this line (from the show palette), if any. */
	theme?: string;
};

export type EpisodeStatus = "pending" | "queued" | "done";

export type EpisodePlan = {
	index: number;
	title: string;
	description: string;
	hashtags: string[];
	/** Persona ids that speak in this episode (subset of the roster). */
	cast: string[];
	sentences: EpisodePlanSentence[];
	status: EpisodeStatus;
	renderId?: string;
	/**
	 * Extension of this episode's own first-frame/thumbnail image (png/jpg/…), if
	 * one was set. Presence means a still lives at
	 * `shows/<showId>/thumbnails/<index>.<ext>` and renders as frame 0.
	 */
	thumbnailExt?: string;
};

export type SeriesManifest = {
	showId: string;
	createdAt: string;
	episodes: EpisodePlan[];
	/**
	 * "Apply to all episodes" default first-frame image extension. Used by any
	 * episode without its own `thumbnailExt`; stored at
	 * `shows/<showId>/thumbnails/all.<ext>`.
	 */
	defaultThumbnailExt?: string;
};

function dummy(show: ShowConfig): SeriesManifest {
	const ids = show.roster.map((p) => p.id);
	const a = ids[0]!;
	const b = ids[1] ?? ids[0]!;
	const firstStance = (id: string) =>
		show.roster.find((p) => p.id === id)!.stances[0]!.name;

	// Honour the configured episode count so DEBUG matches the show's split.
	const count = show.split.type === "episodeCount" ? show.split.count : 2;
	const stage: EpisodePlanAppearance[] =
		a === b
			? [{ personaId: a, stance: firstStance(a), slot: "center" }]
			: [
					{ personaId: a, stance: firstStance(a), slot: "left" },
					{ personaId: b, stance: firstStance(b), slot: "right" },
				];
	const episodes: EpisodePlan[] = Array.from({ length: count }, (_, index) => {
		const n = index + 1;
		return {
		index,
		title: `Secret Story — Day ${n}`,
		description: `Debug episode ${n} of the secret story house.`,
		hashtags: ["#Shorts", "#SecretStory", "#Reality"],
		cast: [a, b],
		status: "pending" as const,
		sentences: [
			{
				speakerId: a,
				appearances: stage,
				sentence: `Day ${n} in the house and something feels off.`,
				illustration: "house",
				// Tag both debug lines with the same room (when one exists) so the
				// "consecutive same room → one continuous background" path is exercised.
				locationKey: show.locations[0]?.key,
			},
			{
				speakerId: b,
				appearances: stage,
				sentence: "Trust me, I already know exactly what's going on.",
				illustration: "whisper",
				locationKey: show.locations[0]?.key,
			},
		],
		};
	});

	return {
		showId: show.id,
		createdAt: new Date().toISOString(),
		episodes,
	};
}

/**
 * One LLM pass over the WHOLE prose that emits every episode at once, so
 * cliffhangers, recaps and casting are coherent across the series.
 */
export async function generateSeriesBreakdown(
	show: ShowConfig,
): Promise<SeriesManifest> {
	if (process.env.DEBUG !== "false") {
		return dummy(show);
	}

	if (show.split.type !== "episodeCount") {
		throw new Error(
			`Split strategy "${show.split.type}" is not implemented yet`,
		);
	}

	const episodeCount = show.split.count;
	const validIds = show.roster.map((p) => p.id) as [string, ...string[]];

	const castDescription = show.roster
		.map((p) => `(ID: '${p.id}') ${p.personaName}: ${p.promptPersonality}`)
		.join("\n");
	const castStances = show.roster
		.map(
			(p) =>
				`${p.personaName} (ID '${p.id}'): ${p.stances.map((s) => s.name).join(", ")}`,
		)
		.join("\n");

	// Locations the writer may set scenes in. We list ALL of them so scenes read
	// coherently; asset resolution later falls back to stock footage for any line
	// whose location has no background picked yet.
	const locationKeys = new Set(show.locations.map((l) => l.key));
	const locationsBlock = show.locations.length
		? show.locations
				.map((l) => `(key: '${l.key}') ${l.name}: ${l.description}`)
				.join("\n")
		: "";

	// Mood themes the writer may switch to per line (a curated palette). Listed by
	// key so the model picks a bare key; sanitised against this set after parsing.
	const themeKeys = new Set(show.themes ?? []);
	const themesBlock = show.themes?.length
		? show.themes.map((t) => `'${t}'`).join(", ")
		: "";

	const SlotEnum = z.enum([
		"far-left",
		"left",
		"center",
		"right",
		"far-right",
	]);
	const AppearanceSchema = z.object({
		personaId: z.enum(validIds),
		stance: z.string(),
		slot: SlotEnum,
	});
	const SentenceSchema = z.object({
		speakerId: z.enum(validIds),
		appearances: z.array(AppearanceSchema).min(1),
		sentence: z.string(),
		illustration: z.string(),
		// Free string; sanitised against the known location keys after parsing
		// (an enum would reject when the show has no locations at all).
		locationKey: z.string().optional(),
		// Free string; sanitised against the show's theme palette after parsing.
		theme: z.string().optional(),
	});

	const EpisodeSchema = z.object({
		title: z.string(),
		description: z.string(),
		hashtags: z.array(z.string()).min(1),
		cast: z.array(z.enum(validIds)).min(1).max(show.maxCastPerEpisode),
		sentences: z.array(SentenceSchema).min(1),
	});

	const Schema = z.object({
		episodes: z.array(EpisodeSchema).min(1),
	});

	const modelAlias =
		process.env.SERIES_MODEL_ALIAS ||
		process.env.GROUP_MODEL_ALIAS ||
		"gemini";

	const prompt = `# ROLE
You are a Showrunner + Scriptwriter for a serialized "PNGTuber" YouTube Shorts reality show. You take a long synopsis and break it into a SERIES of short, high-retention episodes with snappy multi-character banter.

# FULL CAST & ASSETS
${castDescription}

# ANIMATION CONSTRAINTS
Each character MUST only use their specific available stances:
${castStances}
${
	locationsBlock
		? `\n# LOCATIONS (where scenes can take place)\n${locationsBlock}\n`
		: ""
}${
	themesBlock
		? `\n# MOOD THEMES (background music you may switch to per line)\nAvailable theme keys: ${themesBlock}\n`
		: ""
}
# SOURCE SCRIPT (the whole story)
${show.prose}

# YOUR TASK
- Break the story into EXACTLY ${episodeCount} episodes, in chronological order.
- Each episode is a self-contained Short but part of an ongoing arc.
- For each episode, choose the CAST: at most ${show.maxCastPerEpisode} persona id(s) that actually speak in that episode (only ids from the cast above).
- CONTINUITY: from episode 2 onward, open with a quick one-line recap; end every episode (except the last) on a cliffhanger/hook.

# STAGING (who is on screen, and where)
- Each line has a "speakerId" (the persona talking) and an "appearances" list: EVERY character visible on screen for that line, INCLUDING the speaker.
- Each appearance has a "slot" (one of: far-left, left, center, right, far-right) and a "stance".
- Keep a character on the SAME slot for every line where they stay on screen (do not move them around).
- Place two characters who are interacting on OPPOSITE sides (e.g. left vs right) so they face each other.
- The "speakerId" MUST appear in that line's "appearances".
- Use 1 to ${show.maxCastPerEpisode} characters on screen per line; only show characters who are actually in the scene.

# ADDITIONAL INSTRUCTIONS
${show.prompt ? `- ${show.prompt}` : ""}
- Keep sentences under 15-20 words for "Shorts" pacing.
- Make characters interrupt, agree or clash to create energy.
- "illustration" MUST be a concrete noun for stock-footage search (e.g. "locked door" not "suspense").${
		locationsBlock
			? `
- "locationKey" MUST be one of the location keys listed above for the place that line happens in. Keep consecutive lines in the SAME location whenever the scene does not move, so the background stays continuous. Only change locationKey when the scene actually moves to a different place. If no listed location fits, omit "locationKey".`
			: ""
	}${
		themesBlock
			? `
- "theme" sets the background music for that line's mood and MUST be one of the theme keys listed above. Set it only when a line clearly calls for a mood shift (action, dramatic, sad, tense…), and keep the SAME theme across consecutive lines that share a mood so the music does not restart. Omit "theme" to keep the base music playing.`
			: ""
	}
- For each episode also write a catchy "title", an SEO "description", and 3-5 "hashtags" (with the # symbol).
- Do NOT use em dashes.

# OUTPUT REQUIREMENT
Return ONLY a valid JSON object of the form:
{
  "episodes": [
    {
      "title": "",
      "description": "",
      "hashtags": ["#..."],
      "cast": ["persona id", "..."],
      "sentences": [
        {
          "speakerId": "Exact id from cast",
          "appearances": [
            { "personaId": "Exact id from cast", "stance": "Exact stance for that character", "slot": "left" }
          ],
          "sentence": "",
          "illustration": ""${locationsBlock ? ',\n          "locationKey": "one of the location keys, or omit"' : ""}${themesBlock ? ',\n          "theme": "one of the theme keys, or omit"' : ""}
        }
      ]
    }
  ]
}`;

	const result = await promptLlmObject(prompt, modelAlias, Schema);

	if (result.episodes.length !== episodeCount) {
		console.warn(
			`Writer returned ${result.episodes.length} episodes, expected ${episodeCount}`,
		);
	}

	const episodes: EpisodePlan[] = result.episodes.map((ep, index) => ({
		...ep,
		index,
		status: "pending" as const,
		// Drop any hallucinated location/theme key the model invents.
		sentences: ep.sentences.map((s) => ({
			...s,
			locationKey:
				s.locationKey && locationKeys.has(s.locationKey)
					? s.locationKey
					: undefined,
			theme: s.theme && themeKeys.has(s.theme) ? s.theme : undefined,
		})),
	}));

	return {
		showId: show.id,
		createdAt: new Date().toISOString(),
		episodes,
	};
}
