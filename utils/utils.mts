import type {OutputConfig, ScriptSentence} from "../types/app";
import type {PersonaConfig} from "../personae.mts";
import {videoQueue} from "../clients/queues.mts";
import { join, relative } from "node:path";
import { readdir } from "node:fs/promises";

export async function createOuptutFolder() {
	const now = new Date();
	const timestamp = now
		.toISOString()
		.replace(/T/, "_")
		.replace(/\..+/, "")
		.replaceAll(":", "-");

	return `output/${timestamp}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function compileAndSaveVideoConfig(
	seed: number,
	folder: string,
	persona: PersonaConfig,
	sentences: ScriptSentence[],
	satisfyingVideoPath: string
) {
	const outputConfig: OutputConfig = {
		seed,
		satisfyingVideo: satisfyingVideoPath,
		persona,
		sentences,
	};

	await Bun.s3.write(
		folder + "/config.json",
		JSON.stringify(outputConfig, null, 2),
	);

	return outputConfig;
}

export async function sendRenderMessage(folder: string) {
	return await videoQueue.add(
		"remotion-render",
		{
			folderPath: folder,
		},
		{
			attempts: 1,
			backoff: {
				type: "exponential",
				delay: 2000,
			},
		},
	);
}

export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
	url: string,
	fileName: string,
	retries = 3,
) {
	for (let i = 0; i < retries; i++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

		try {
			console.log(`Fetching ${fileName} (Attempt ${i + 1})...`);

			const response = await fetch(url, { signal: controller.signal });

			if (!response.ok) throw new Error(`Status: ${response.status}`);

			// If you need to stream to disk (to avoid memory issues with large videos)
			const arrayBuffer = await response.arrayBuffer();
			await Bun.s3.write(fileName, arrayBuffer);

			clearTimeout(timeoutId);
			console.log(`✅ Downloaded: ${fileName}`);
			return; // Success!
		} catch (err: any) {
			clearTimeout(timeoutId);
			const isTimeout = err.name === "AbortError";

			console.warn(
				`⚠️ ${isTimeout ? "Timeout" : "Error"} on ${fileName}. ` +
					(i < retries - 1 ? "Retrying..." : "Failed all attempts."),
			);

			if (i === retries - 1) throw err;

			// Wait a bit longer before retrying to appease Pexels
			await sleep(15000 * (i + 1));
		}
	}
}

export async function ensureDevelopmentAssets() {
	if (process.env.DEBUG === 'false') {
		return;
	}

	const personaeExist = await Bun.s3.list({prefix: "personae/debug/"});

	if (!personaeExist.contents) {
		console.log("Syncing personae/debug...");
		// In a real app, you'd loop through your local /assets/personae/debug folder
		const personaDir = '/assets/personae/debug';
		const files = await readdir(personaDir, { recursive: true, withFileTypes: true });

		for (const f of files) {
			if (f.isFile()) {
				const fullLocalPath = join(f.parentPath, f.name);

				// Calculate the S3 key (e.g., "personae/debug/subdir/file.json")
				const relativePath = relative(personaDir, fullLocalPath);
				const s3Key = join('personae/debug/', relativePath);

				await Bun.s3.write(s3Key, Bun.file(fullLocalPath));
			}
		}
	}

	// 2. Check for "audio/themes/debug.ogg"
	const audioExists = await Bun.s3.exists("audio/themes/debug.ogg");

	if (!audioExists) {
		console.log("Syncing debug audio...");
		const localAudio = "/assets/themes/debug.ogg";
		await Bun.s3.write("audio/themes/debug.ogg", Bun.file(localAudio));
	}
}