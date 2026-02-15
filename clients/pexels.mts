import { createClient } from "pexels";

const apiKey = process.env.PEXELS_API_KEY;

if (!apiKey) {
	throw new Error("Missing PEXELS_API_KEY in environment variables");
}

export default createClient(apiKey);
