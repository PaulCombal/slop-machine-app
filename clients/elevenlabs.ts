import { ElevenLabsClient } from "elevenlabs";

const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  throw new Error("Missing ELEVENLABS_API_KEY in environment variables");
}

export default new ElevenLabsClient({
  apiKey,
});