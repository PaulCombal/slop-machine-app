import {generateText, Output} from "ai";
import {google} from "@ai-sdk/google";
import {huggingface} from "@ai-sdk/huggingface";
import {mistral} from '@ai-sdk/mistral';
import {z} from "zod";
import {sleep} from "./utils.mts";

// const GEMINI_MODEL = google("gemini-2.5-flash");
const GEMINI_MODEL = google("gemini-flash-latest");
const GLM_MODEL = huggingface("zai-org/GLM-5");
const HF_MODEL = huggingface("katanemo/Arch-Router-1.5B");
const MISTRAL_MODEL = mistral('mistral-large-latest');

type ModelAlias = "gemini" | "glm" | "hf" | "mistral";

export async function promptLlm(
  prompt: string,
  model: ModelAlias | string,
  toolNames: ('googleSearch')[] = []
): Promise<string> {
  const models: Record<string, typeof GEMINI_MODEL> = {
    gemini: GEMINI_MODEL,
    glm: GLM_MODEL,
    hf: HF_MODEL,
    mistral: MISTRAL_MODEL
  };

  const modelObj = models[model];
  const tools: Record<string, any> = {};

  if (!modelObj) {
    throw new Error('Unknown model alias: ' + model);
  }

  if (toolNames.includes('googleSearch')) {
    tools.google_search = google.tools.googleSearch({});
  }

  const maxRetries = 9;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateText({prompt, model: modelObj, tools});
      return result.text;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error('Final attempt failed. Throwing error.');
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);

      console.log(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
      console.log('Reason:', error.reason);
      console.log(error)

      await sleep(delay);
    }
  }

  throw new Error('Logic error, this should never be reached')
}

export async function promptLlmObject<T>(
  prompt: string,
  model: ModelAlias | string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const models: Record<string, typeof GEMINI_MODEL> = {
    gemini: GEMINI_MODEL,
    glm: GLM_MODEL,
    hf: HF_MODEL,
    mistral: MISTRAL_MODEL
  };

  const modelObj = models[model];
  if (!modelObj) {
    throw new Error('Unknown model alias: ' + model);
  }

  const maxRetries = 9;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const {output} = await generateText({
        prompt,
        model: modelObj,
        output: Output.object({schema}),
      });

      return output;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error('Final attempt failed. Throwing error.');
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);

      console.log(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
      console.log('Reason:', error.reason);
      console.log(error)

      await sleep(delay);
    }
  }

  throw new Error('Logic error, this should never be reached')
}

export function parseAiJson(rawString: string) {
  // Regex: Matches ``` (optional language) [content] ```
  // [^] matches any character including newlines
  const regex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = rawString.match(regex);
  const jsonString = match ? match[1]! : rawString;
  const finalString = jsonString.replace(/<think>[\s\S]*?<\/think>/g, "");

  try {
    return JSON.parse(finalString.trim());
  } catch (error) {
    console.error("Failed to parse JSON content:", jsonString, error);
    throw error;
  }
}
