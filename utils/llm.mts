import {generateText, Output} from "ai";
import {google} from "@ai-sdk/google";
import {huggingface} from "@ai-sdk/huggingface";
import {mistral} from '@ai-sdk/mistral';
import {z} from "zod";

const GEMINI_MODEL = google("gemini-flash-latest");
const GEMINI25_MODEL = google("gemini-2.5-flash");
const GLM_MODEL = huggingface("zai-org/GLM-5");
const HF_MODEL = huggingface("katanemo/Arch-Router-1.5B");
const MISTRAL_MODEL = mistral('mistral-large-latest');

type ModelAlias = "gemini" | "gemini25" | "glm" | "hf" | "mistral";

export async function promptLlmObject<T>(
  prompt: string,
  model: ModelAlias | string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const models: Record<string, typeof GEMINI_MODEL> = {
    gemini: GEMINI_MODEL,
    gemini25: GEMINI25_MODEL,
    glm: GLM_MODEL,
    hf: HF_MODEL,
    mistral: MISTRAL_MODEL
  };

  const modelObj = models[model];
  if (!modelObj) {
    throw new Error('Unknown model alias: ' + model);
  }

  try {
    const {output} = await generateText({
      prompt,
      model: modelObj,
      output: Output.object({schema}),
    });

    return output;
  } catch (error) {
    console.log("error in generateText", error)
  }

  throw new Error('PromptLlmObject failed')
}

// export function parseAiJson(rawString: string) {
//   // Regex: Matches ``` (optional language) [content] ```
//   // [^] matches any character including newlines
//   const regex = /```(?:json)?\s*([\s\S]*?)\s*```/;
//   const match = rawString.match(regex);
//   const jsonString = match ? match[1]! : rawString;
//   const finalString = jsonString.replace(/<think>[\s\S]*?<\/think>/g, "");
//
//   try {
//     return JSON.parse(finalString.trim());
//   } catch (error) {
//     console.error("Failed to parse JSON content:", jsonString, error);
//     throw error;
//   }
// }
