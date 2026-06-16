// Cloudflare Workers AI image generation (raw HTTP, no SDK). SDXL = text-to-image,
// SD 1.5 = img2img, FLUX.2 klein = instruction-based edit/generation.

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SDXL_MODEL = process.env.STANCE_CF_MODEL || "@cf/bytedance/stable-diffusion-xl-lightning";
const IMG2IMG_MODEL =
	process.env.STANCE_CF_IMG2IMG_MODEL || "@cf/runwayml/stable-diffusion-v1-5-img2img";
// img2img: how strongly to repaint the reference (0 = keep input, 1 = ignore it).
const STRENGTH = Number(process.env.STANCE_CF_STRENGTH || "0.65");
const FLUX_MODEL = process.env.STANCE_FLUX_MODEL || "@cf/black-forest-labs/flux-2-klein-9b";
const FLUX_STEPS = process.env.STANCE_FLUX_STEPS || "20";
const FLUX_SIZE = process.env.STANCE_FLUX_SIZE || "1024";
const FLUX_MAX_RETRIES = 4;

export function cloudflareConfigured(): boolean {
	return Boolean(ACCOUNT && TOKEN);
}

type ImageReference = { data: Uint8Array; mediaType: string };

function runUrl(model: string): string {
	return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`;
}

/** POST a JSON body to an image model that returns raw image bytes. */
async function runJsonImage(model: string, body: Record<string, unknown>): Promise<Uint8Array> {
	if (!cloudflareConfigured()) {
		throw new Error("Cloudflare Workers AI is not configured");
	}
	const res = await fetch(runUrl(model), {
		method: "POST",
		headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`Workers AI failed (${res.status}): ${await res.text()}`);
	}
	// Image models return the binary image; an error would come back as JSON.
	if (res.headers.get("content-type")?.includes("application/json")) {
		throw new Error(`Workers AI returned no image: ${await res.text()}`);
	}
	return new Uint8Array(await res.arrayBuffer());
}

export async function generateImageSdxl(prompt: string): Promise<Uint8Array> {
	return runJsonImage(SDXL_MODEL, { prompt });
}

export async function generateImageSd15(
	prompt: string,
	reference: ImageReference,
): Promise<Uint8Array> {
	return runJsonImage(IMG2IMG_MODEL, {
		prompt,
		image_b64: Buffer.from(reference.data).toString("base64"),
		strength: STRENGTH,
	});
}

// References ride as `input_image_0..3` multipart parts; output is base64 JSON.
export async function generateImageFlux2(
	prompt: string,
	references: ImageReference[] = [],
): Promise<Uint8Array> {
	if (!cloudflareConfigured()) {
		throw new Error("Cloudflare Workers AI is not configured");
	}
	let lastErr = "";
	for (let attempt = 0; attempt < FLUX_MAX_RETRIES; attempt++) {
		const form = new FormData();
		form.set("prompt", prompt);
		form.set("steps", FLUX_STEPS);
		form.set("width", FLUX_SIZE);
		form.set("height", FLUX_SIZE);
		references.slice(0, 4).forEach((r, i) => {
			form.set(
				`input_image_${i}`,
				new File([r.data], `ref${i}.png`, { type: r.mediaType || "image/png" }),
			);
		});
		const res = await fetch(runUrl(FLUX_MODEL), {
			method: "POST",
			headers: { authorization: `Bearer ${TOKEN}` },
			body: form,
		});
		const text = await res.text();
		if (res.ok) {
			const b64 = (JSON.parse(text)?.result ?? {}).image;
			if (!b64) throw new Error("FLUX.2 returned no image");
			return new Uint8Array(Buffer.from(b64, "base64"));
		}
		lastErr = text;
		// The safety filter sometimes flags benign output — just try again.
		if (text.includes("flagged")) continue;
		throw new Error(`FLUX.2 failed (${res.status}): ${text}`);
	}
	throw new Error(`FLUX.2 flagged after ${FLUX_MAX_RETRIES} attempts: ${lastErr}`);
}
