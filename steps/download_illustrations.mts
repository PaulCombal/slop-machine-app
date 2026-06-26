import { join } from "node:path";
import type { ScriptSentence } from "../types/app";
import { fetchWithRetry, sleep } from "../utils/utils.mts";

async function dummy(outputFolder: string) {
	const sourceFile = Bun.file(`/assets/debug/sentence_1_illustration.mp4`);
	await Bun.s3.write(outputFolder + `/sentence_1_illustration.mp4`, sourceFile);
	await Bun.s3.write(outputFolder + `/sentence_2_illustration.mp4`, sourceFile);
}

// Returns true if it actually downloaded, false if it was already present.
async function downloadIllustration(
	sentence: ScriptSentence,
	index: number,
	outputFolder: string,
): Promise<boolean> {
	// Room-backed lines get their background copied from the show location asset
	// (see prepareEpisodeAssets), so there is nothing to download here.
	if (sentence.illustrationRoom) {
		return false;
	}

	const fileName = sentence.illustrationFile ?? `sentence_${index + 1}_illustration.mp4`;
	const filePath = join(outputFolder, fileName);

	if (await Bun.s3.exists(filePath)) {
		console.log(`↩️  Skipping existing ${fileName}`);
		return false;
	}

	if (!sentence.illustrationVideo) {
		throw new Error(
			`Illustration video url must be set for sentence ${index + 1}`,
		);
	}

	console.log(`Fetching ${fileName} (${sentence.illustrationVideo.link})`);
	await fetchWithRetry(sentence.illustrationVideo.link, filePath);
	console.log(`✅ Downloaded: ${fileName}`);
	return true;
}

export default async function downloadIllustrations(
	sentences: ScriptSentence[],
	outputFolder: string,
) {
	if (process.env.DEBUG !== "false") {
		return dummy(outputFolder);
	}

	if (process.env.ILLUSTRATION_DL_PARALLEL === "true") {
		const downloadPromises = sentences.map((sentence, i) =>
			downloadIllustration(sentence, i, outputFolder),
		);
		await Promise.all(downloadPromises);
	} else {
		// Sequential: Waits for each download to finish before starting the next
		for (let i = 0; i < sentences.length; i++) {
			const downloaded = await downloadIllustration(sentences[i]!, i, outputFolder);

			// Only rate-limit between ACTUAL downloads; skipped files cost nothing.
			if (downloaded && i < sentences.length - 1) {
				console.log(`⏳ Waiting 61 seconds to avoid rate limits...`);
				await sleep(61000);
			}
		}
	}
}
