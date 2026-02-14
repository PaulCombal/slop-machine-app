import { join } from "node:path";
import type {ScriptSentence} from "../types/app";

async function dummy(outputFolder: string) {
  const sourceFile = Bun.file(`/assets/debug/sentence_1_illustration.mp4`);
  await Bun.write(outputFolder + `/sentence_1_illustration.mp4`, sourceFile);
  await Bun.write(outputFolder + `/sentence_2_illustration.mp4`, sourceFile);
}

export default async function downloadIllustrations(sentences: ScriptSentence[], outputFolder: string) {
  if (process.env.DEBUG !== 'false') {
    return dummy(outputFolder);
  }

  const downloadPromises = sentences.map(async (sentence, i) => {
    if (!sentence.illustrationVideoUrl) throw new Error('Illustration video url must be set');

    const filePath = join(outputFolder, `sentence_${i+1}_illustration.mp4`);

    // Fetch the video data
    const response = await fetch(sentence.illustrationVideoUrl);

    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

    // Bun.write handles the stream/buffer writing automatically
    await Bun.write(filePath, response);

    console.log(`✅ Downloaded: sentence_${i+1}_illustration.mp4`);
  });

  await Promise.all(downloadPromises);
}