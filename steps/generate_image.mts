import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import {
	generateImageFlux2,
	generateImageSd15,
	generateImageSdxl,
} from "../clients/cloudflareWorkersAi.ts";

const IMAGE_MODEL = google(
	process.env.STANCE_IMAGE_MODEL || "gemini-2.5-flash-image",
);

export type ImageReference = { data: Uint8Array; mediaType: string };

// Image backends the Stance Studio lets the user pick from (see the model select).
// `ref` = usable when editing from a reference; `noRef` = usable generating from
// scratch. The form shows only the options matching the current reference choice.
export type StanceModel = "flux2" | "sdxl" | "sd15" | "gemini";
export const STANCE_MODELS: {
	id: StanceModel;
	label: string;
	ref: boolean;
	noRef: boolean;
}[] = [
	{ id: "flux2", label: "FLUX.2 klein — edits + follows instructions", ref: true, noRef: true },
	{ id: "sdxl", label: "SDXL Lightning — fast text-to-image", ref: false, noRef: true },
	{ id: "sd15", label: "SD 1.5 img2img — pose variation from a reference", ref: true, noRef: false },
	{ id: "gemini", label: "Gemini — instruction edits (needs API quota)", ref: true, noRef: true },
];
const DEFAULT_MODEL: StanceModel = "flux2";

/**
 * Wrap the user's description with guidance that keeps stances usable as
 * PNGTuber artwork (single full-body subject, plain flat background so it keys
 * out cleanly later) and consistent with any reference image.
 */
export function buildStancePrompt(userPrompt: string, hasReference: boolean): string {
	const consistency = hasReference
		? "Keep the EXACT same character as the reference image (same design, colors, proportions); only change the pose/expression as described. "
		: "";
	return (
		`A single full-body PNGTuber character, centered, facing one direction, ` +
		`on a plain flat solid-color background (no scenery, no shadows on the ground). ` +
		consistency +
		`Description: ${userPrompt}`
	);
}

/** Generate one stance image with the chosen model. Returns raw image bytes. */
export async function generateStanceImage(
	prompt: string,
	references: ImageReference[] = [],
	model: StanceModel = DEFAULT_MODEL,
): Promise<Uint8Array> {
	switch (model) {
		case "gemini":
			return generateStanceImageGemini(prompt, references);
		case "sdxl":
			return generateImageSdxl(prompt);
		case "sd15":
			// img2img needs a reference; without one, fall back to text-to-image.
			return references[0]
				? generateImageSd15(prompt, references[0])
				: generateImageSdxl(prompt);
		default:
			return generateImageFlux2(prompt, references);
	}
}

async function generateStanceImageGemini(
	prompt: string,
	references: ImageReference[],
): Promise<Uint8Array> {
	const content: any[] = [{ type: "text", text: prompt }];
	for (const r of references) {
		content.push({ type: "image", image: r.data, mediaType: r.mediaType });
	}

	const { files } = await generateText({
		model: IMAGE_MODEL,
		providerOptions: { google: { responseModalities: ["IMAGE"] } },
		messages: [{ role: "user", content }],
	});

	const img = files.find((f) => f.mediaType?.startsWith("image/"));
	if (!img) {
		throw new Error("Gemini returned no image");
	}
	return img.uint8Array;
}
