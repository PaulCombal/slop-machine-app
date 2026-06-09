import { z } from "zod";
import type { ShowConfig } from "../show.mts";
import { promptLlmObject } from "../utils/llm.mts";

export type EpisodePlanSentence = {
	personaId: string;
	sentence: string;
	stance: string;
	illustration: string;
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
};

export type SeriesManifest = {
	showId: string;
	createdAt: string;
	episodes: EpisodePlan[];
};

function dummy(show: ShowConfig): SeriesManifest {
	const ids = show.roster.map((p) => p.id);
	const a = ids[0]!;
	const b = ids[1] ?? ids[0]!;
	const firstStance = (id: string) =>
		show.roster.find((p) => p.id === id)!.stances[0]!.name;

	const episodes: EpisodePlan[] = [1, 2].map((n, index) => ({
		index,
		title: `Secret Story — Day ${n}`,
		description: `Debug episode ${n} of the secret story house.`,
		hashtags: ["#Shorts", "#SecretStory", "#Reality"],
		cast: [a, b],
		status: "pending" as const,
		sentences: [
			{
				personaId: a,
				sentence: `Day ${n} in the house and something feels off.`,
				stance: firstStance(a),
				illustration: "house",
			},
			{
				personaId: b,
				sentence: "Trust me, I already know exactly what's going on.",
				stance: firstStance(b),
				illustration: "whisper",
			},
		],
	}));

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

	const SentenceSchema = z.object({
		personaId: z.enum(validIds),
		sentence: z.string(),
		stance: z.string(),
		illustration: z.string(),
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

# SOURCE SCRIPT (the whole story)
${show.prose}

# YOUR TASK
- Break the story into EXACTLY ${episodeCount} episodes, in chronological order.
- Each episode is a self-contained Short but part of an ongoing arc.
- For each episode, choose the CAST: at most ${show.maxCastPerEpisode} persona id(s) that actually speak in that episode (only ids from the cast above).
- Every sentence's "personaId" MUST be one of that episode's chosen cast.
- CONTINUITY: from episode 2 onward, open with a quick one-line recap; end every episode (except the last) on a cliffhanger/hook.

# ADDITIONAL INSTRUCTIONS
${show.prompt ? `- ${show.prompt}` : ""}
- Keep sentences under 15-20 words for "Shorts" pacing.
- Make characters interrupt, agree or clash to create energy.
- "illustration" MUST be a concrete noun for stock-footage search (e.g. "locked door" not "suspense").
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
        { "personaId": "Exact id from cast", "sentence": "", "stance": "Exact stance for that character", "illustration": "" }
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
	}));

	return {
		showId: show.id,
		createdAt: new Date().toISOString(),
		episodes,
	};
}
