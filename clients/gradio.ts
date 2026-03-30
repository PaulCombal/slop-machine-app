import {Client} from "@gradio/client";

export function gradioClient(app_reference: string, options?: Record<string, any>) {
  // @ts-ignore
  const token: `hf_${string}` | undefined = process.env.HUGGINGFACE_API_KEY || undefined;
  return Client.connect(app_reference, {token, ...options})
}