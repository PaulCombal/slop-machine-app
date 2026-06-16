import { z } from "zod";
import { promptLlmObject } from "../utils/llm.mts";

// Stances every character gets, regardless of personality.
export const CORE_STANCES = ["idle", "talking", "pointing", "angry", "thinking", "jubilating", "shocked"] as const;

export type CharacterDraft = {
	key: string;
	personaName: string;
	promptPersonality: string;
	stanceDefaultPrompt: string; // reusable image prompt for this character's look
	stances: string[]; // core + character-specific extras, sanitised + deduped
};

const CastSchema = z.object({
	characters: z
		.array(
			z.object({
				key: z
					.string()
					.describe(
						"short stable url-safe id for the character, lowercase, letters/digits/hyphens only (e.g. 'amara', 'morel')",
					),
				personaName: z.string().describe("the character's display name"),
				promptPersonality: z
					.string()
					.describe(
						"a vivid FIRST-PERSON paragraph in the character's own voice describing who they are, how they talk, their attitude and quirks — used to drive how they speak in scripts",
					),
				appearancePrompt: z
					.string()
					.describe(
						"a reusable THIRD-PERSON image-generation prompt describing ONLY this character's visual look (species/shape, colours, distinctive features, art style) — reused to generate every stance, so keep it consistent and not tied to any one pose",
					),
				extraStances: z
					.array(z.string())
					.describe(
						"0-4 extra stance/expression names specific to this character besides idle/talking, single lowercase words like 'shocked', 'smug', 'scheming'",
					),
			}),
		)
		.describe("one entry per named character found in the prose"),
});

const MODEL_ALIAS = process.env.PERSONA_MODEL_ALIAS || "gemini25";

export async function generateCastFromProse(
	prose: string,
	tone?: string,
): Promise<CharacterDraft[]> {
	const prompt = `You are casting a short-form video show. Read the SHOW PROSE below and extract EVERY named character in it.

For each character return:
- key: a short, stable, url-safe id (lowercase letters/digits/hyphens).
- personaName: their display name.
- promptPersonality: a vivid FIRST-PERSON paragraph written as the character ("I am..."), capturing who they are, their attitude, speaking style and quirks. This is what makes them sound distinct in scripts, so make it specific to THIS character.
- appearancePrompt: a reusable THIRD-PERSON image-generation prompt describing ONLY this character's visual look (species/shape, colours, distinctive features, art style). It is reused to generate every stance, so keep it pose-agnostic and consistent.
- extraStances: up to 4 short expression/pose names (besides idle and talking) that fit this character's personality.

Only include characters actually present in the prose. Do not invent new ones.${
		tone ? `\n\nOverall show tone/direction to honour: ${tone}` : ""
	}

SHOW PROSE:
${prose}`;

	const cast = await withRetry(() =>
		promptLlmObject(prompt, MODEL_ALIAS, CastSchema),
	);

	const seen = new Set<string>();
	const drafts: CharacterDraft[] = [];
	for (const ch of cast.characters) {
		const key = slugKey(ch.key || ch.personaName);
		if (seen.has(key)) continue; // collapse duplicates the model may emit
		seen.add(key);
		const extras = (ch.extraStances || []).map(slugStance).filter(Boolean);
		const stances = Array.from(new Set([...CORE_STANCES, ...extras]));
		drafts.push({
			key,
			personaName: ch.personaName.trim() || key,
			promptPersonality: ch.promptPersonality.trim(),
			stanceDefaultPrompt: (ch.appearancePrompt ?? "").trim(),
			stances,
		});
	}
	return drafts;
}

// Placeholder PNG bundled in the app, loaded once and reused for every stance.
let placeholder: Promise<Uint8Array> | null = null;
function loadPlaceholder(): Promise<Uint8Array> {
	if (!placeholder) {
		placeholder = Bun.file(
			new URL("../assets/stance-placeholder.png", import.meta.url),
		)
			.arrayBuffer()
			.then((b) => new Uint8Array(b));
	}
	return placeholder;
}

/** Write the placeholder image to each stance's S3 path for a fresh persona. */
export async function writePlaceholderStances(
	assetId: string,
	stanceNames: string[],
): Promise<void> {
	const bytes = await loadPlaceholder();
	await Promise.all(
		stanceNames.map((name) =>
			Bun.s3.write(`personae/${assetId}/${name}.png`, bytes, { type: "image/png" }),
		),
	);
}

// promptLlmObject has no retry, and the LLM (Gemini) intermittently returns a
// retryable 503 under load — costly to lose a whole cast generation over, so
// retry a few times with backoff before giving up.
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
	let lastErr: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (e) {
			lastErr = e;
			if (i < attempts - 1) await Bun.sleep(1000 * 2 ** i);
		}
	}
	throw lastErr;
}

function slugKey(raw: string): string {
	const s = raw
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 64);
	return s || "char";
}

function slugStance(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
}
