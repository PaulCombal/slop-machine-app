import { z } from "zod";
import { NEWS_CATEGORIES } from "../steps/news/currents.ts";

/**
 * Zod schemas guarding the enums/shapes a bad form could push into the worker
 * (e.g. an unknown `split.type`). Numeric fields use `z.coerce.number` since
 * form values are strings; the route normalises booleans/arrays/JSON first.
 * Key uniqueness and membership existence are enforced in the mutation layer.
 */

const LANGUAGE = z.enum(["en-US", "fr-FR"]);
const TTS = z.enum(["elevenlabs", "kokoro", "qwen", "pocket"]);
const PLATFORM = z.enum(["yt", "ig", "tt"]);
export const SATISFYING_CATEGORIES = [
	"satisfying",
	"gameplay",
	"america",
] as const;
const SATISFYING = z.enum(SATISFYING_CATEGORIES);

/** A logical key/id: stable, URL-safe, used in scripts and job payloads. */
const key = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9_-]+$/, "letters, digits, _ or - only");

const stanceSchema = z
	.object({ name: z.string().trim().min(1) })
	.passthrough();

export const personaSchema = z.object({
	key,
	assetId: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v && v.length ? v : null)),
	personaName: z.string().trim().min(1),
	language: LANGUAGE,
	theme: z.string().trim().min(1),
	themeVolume: z.coerce.number().min(0).max(1),
	ttsProvider: TTS,
	elevenLabsVoiceId: z.string().trim().default(""),
	kokoroVoiceId: z.string().trim().default(""),
	kokoroLanguage: z.string().trim().default(""),
	qwenVoiceId: z.string().trim().default(""),
	pocketVoiceId: z.string().trim().default(""),
	pocketUseVoiceSample: z.boolean().default(false),
	size: z.coerce.number(),
	posXRange: z.coerce.number(),
	posXOffset: z.coerce.number(),
	groupPosXRange: z.coerce.number(),
	groupPosXOffset: z.coerce.number(),
	newsRegion: z.string().trim().default(""),
	newsTopics: z.array(z.enum(NEWS_CATEGORIES)).default([]),
	ytCategoryCode: z.string().trim().default(""),
	promptPersonality: z.string().default(""),
	promptVideoMeta: z.string().default(""),
	promptVideoMetaGivenNewsTmpl: z.string().default(""),
	promptScriptGuidelinesTmpl: z.string().default(""),
	stances: z.array(stanceSchema).min(1, "at least one stance is required"),
});

export const groupSchema = z.object({
	key,
	prompt: z.string().default(""),
	channelId: z.string().trim().min(1),
	platforms: z.array(PLATFORM).min(1, "pick at least one platform"),
	theme: z.string().trim().min(1),
	themeVolume: z.coerce.number().min(0).max(1),
	satisfyingVideoCategory: SATISFYING,
	endPaddingDurationMs: z.coerce.number().int().min(0),
	personaKeys: z.array(key).min(1, "a group needs at least one persona"),
});

export const splitSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("episodeCount"),
		count: z.coerce.number().int().positive(),
	}),
	z.object({
		type: z.literal("wordBudget"),
		wordsPerEpisode: z.coerce.number().int().positive(),
	}),
	z.object({
		type: z.literal("length"),
		targetSeconds: z.coerce.number().positive(),
	}),
]);

export const showSchema = z.object({
	key,
	prose: z.string().trim().min(1),
	prompt: z.string().default(""),
	split: splitSchema,
	maxCastPerEpisode: z.coerce.number().int().positive(),
	channelId: z.string().trim().min(1),
	platforms: z.array(PLATFORM).min(1, "pick at least one platform"),
	theme: z.string().trim().min(1),
	themeVolume: z.coerce.number().min(0).max(1),
	satisfyingVideoCategory: SATISFYING,
	endPaddingDurationMs: z.coerce.number().int().min(0),
	ytCategoryCode: z.string().trim().default(""),
	rosterKeys: z.array(key).min(1, "a show needs at least one persona in its roster"),
});

export const mediaSchema = z.object({
	assetKey: key,
	displayName: z.string().trim().default(""),
});

export const channelSchema = z.object({
	channelKey: key,
	displayName: z.string().trim().default(""),
	igUsername: z.string().trim().default(""),
});

export type MediaFields = z.infer<typeof mediaSchema>;
export type ChannelFields = z.infer<typeof channelSchema>;
export type PersonaInput = z.infer<typeof personaSchema>;
export type GroupInput = z.infer<typeof groupSchema>;
export type ShowInput = z.infer<typeof showSchema>;

/** Flatten a ZodError into `{ field: message }` for inline form display. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
	const out: Record<string, string> = {};
	for (const issue of err.issues) {
		const path = issue.path.join(".") || "_";
		if (!out[path]) out[path] = issue.message;
	}
	return out;
}
