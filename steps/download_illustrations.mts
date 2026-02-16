import { join } from "node:path";
import type { ScriptSentence } from "../types/app";
import { fetchWithRetry, sleep } from "../utils/utils.mts";

async function dummy(outputFolder: string) {
	const sourceFile = Bun.file(`/assets/debug/sentence_1_illustration.mp4`);
	await Bun.s3.write(outputFolder + `/sentence_1_illustration.mp4`, sourceFile)
	await Bun.s3.write(outputFolder + `/sentence_2_illustration.mp4`, sourceFile);
}

async function downloadIllustration(
	sentence: ScriptSentence,
	index: number,
	outputFolder: string,
) {
	if (!sentence.illustrationVideo) {
		throw new Error(
			`Illustration video url must be set for sentence ${index + 1}`,
		);
	}

	const fileName = `sentence_${index + 1}_illustration.mp4`;
	const filePath = join(outputFolder, fileName);

	console.log(`Fetching ${fileName} (${sentence.illustrationVideo.link})`);
	await fetchWithRetry(sentence.illustrationVideo.link, filePath);
	console.log(`✅ Downloaded: ${fileName}`);
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
			await downloadIllustration(sentences[i]!, i, outputFolder);

			if (i < sentences.length - 1) {
				console.log(`⏳ Waiting 61 seconds to avoid rate limits...`);
				await sleep(61000);
			}
		}
	}
}
