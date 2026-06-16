// Cloudinary AI background removal (e_background_removal). Raw HTTP, no SDK —
// mirrors the lean fetch-based client style (see clients/gradio.ts).

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;

const FOLDER = "stance-drafts";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

export function cloudinaryConfigured(): boolean {
	return Boolean(CLOUD && KEY && SECRET);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha1Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cloudinary signature: sha1(sorted "k=v&…" of signed params + api_secret). */
async function sign(params: Record<string, string>): Promise<string> {
	const toSign = Object.keys(params)
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join("&");
	return sha1Hex(toSign + SECRET);
}

function timestamp(): string {
	return String(Math.floor(Date.now() / 1000));
}

/** Upload bytes via a signed request; returns the asset's public_id. */
async function upload(png: Uint8Array): Promise<string> {
	const ts = timestamp();
	const signature = await sign({ folder: FOLDER, timestamp: ts });
	const form = new FormData();
	form.set("file", `data:image/png;base64,${Buffer.from(png).toString("base64")}`);
	form.set("api_key", KEY!);
	form.set("timestamp", ts);
	form.set("folder", FOLDER);
	form.set("signature", signature);

	const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
		method: "POST",
		body: form,
	});
	if (!res.ok) {
		throw new Error(`Cloudinary upload failed (${res.status}): ${await res.text()}`);
	}
	const json = (await res.json()) as { public_id?: string };
	if (!json.public_id) {
		throw new Error("Cloudinary upload returned no public_id");
	}
	return json.public_id;
}

/** Best-effort delete so the stance-drafts folder doesn't accumulate. */
async function destroy(publicId: string): Promise<void> {
	const ts = timestamp();
	const signature = await sign({ public_id: publicId, timestamp: ts });
	const form = new FormData();
	form.set("public_id", publicId);
	form.set("api_key", KEY!);
	form.set("timestamp", ts);
	form.set("signature", signature);
	await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`, {
		method: "POST",
		body: form,
	});
}

/** Remove the background and return a transparent PNG. */
export async function removeBackgroundCloudinary(png: Uint8Array): Promise<Uint8Array> {
	if (!cloudinaryConfigured()) {
		throw new Error("Cloudinary is not configured");
	}

	const publicId = await upload(png);
	try {
		const url = `https://res.cloudinary.com/${CLOUD}/image/upload/e_background_removal/f_png/${publicId}.png`;
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		for (;;) {
			const res = await fetch(url);
			if (res.ok) {
				return new Uint8Array(await res.arrayBuffer());
			}
			// 423 Locked = the AI transformation is still processing.
			if (res.status === 423 && Date.now() < deadline) {
				await sleep(POLL_INTERVAL_MS);
				continue;
			}
			throw new Error(`Cloudinary bg-removal failed (${res.status}): ${await res.text()}`);
		}
	} finally {
		await destroy(publicId).catch(() => {});
	}
}
