import { z } from "zod";
import { promptLlmObject } from "../utils/llm.mts";
import { slugKey, withRetry } from "./generate_personae.mts";

// A distinct place a scene happens in. `description` is pose/character-agnostic
// so it can seed a Pexels search or an AI image of the empty set.
export type LocationDraft = {
	key: string;
	name: string;
	description: string;
};

const LocationsSchema = z.object({
	locations: z
		.array(
			z.object({
				key: z
					.string()
					.describe(
						"short stable url-safe id, lowercase letters/digits/hyphens only (e.g. 'kitchen', 'confessional', 'garden')",
					),
				name: z.string().describe("the location's display name (e.g. 'Kitchen')"),
				description: z
					.string()
					.describe(
						"a vivid THIRD-PERSON visual description of the empty place — its setting, mood, lighting and key objects — used to search stock footage or generate a background image. Describe ONLY the place, never any characters or actions.",
					),
			}),
		)
		.describe("one entry per distinct physical place/room where scenes take place"),
});

const MODEL_ALIAS = process.env.PERSONA_MODEL_ALIAS || "gemini25";

export async function generateLocationsFromProse(
	prose: string,
	tone?: string,
): Promise<LocationDraft[]> {
	const prompt = `You are art-directing a short-form video show. Read the SHOW PROSE below and extract EVERY distinct physical place or room where scenes happen (e.g. kitchen, garden, bedroom, confessional booth).

For each location return:
- key: a short, stable, url-safe id (lowercase letters/digits/hyphens).
- name: its display name.
- description: a vivid THIRD-PERSON visual description of the EMPTY place — its setting, mood, lighting and notable objects. It is used to find stock footage or generate a background image, so describe ONLY the place, never any characters or actions.

Merge near-duplicate places into one. Only include locations actually implied by the prose. Do not invent unrelated ones.${
		tone ? `\n\nOverall show tone/direction to honour: ${tone}` : ""
	}

SHOW PROSE:
${prose}`;

	const res = await withRetry(() =>
		promptLlmObject(prompt, MODEL_ALIAS, LocationsSchema),
	);

	const seen = new Set<string>();
	const drafts: LocationDraft[] = [];
	for (const loc of res.locations) {
		const key = slugKey(loc.key || loc.name);
		if (seen.has(key)) continue; // collapse duplicates the model may emit
		seen.add(key);
		drafts.push({
			key,
			name: loc.name.trim() || key,
			description: (loc.description ?? "").trim(),
		});
	}
	return drafts;
}
