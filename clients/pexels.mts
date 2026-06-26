import { createClient } from "pexels";

type PexelsClient = ReturnType<typeof createClient>;

// Lazily created on first use so importing this module never throws — a missing
// key should degrade the Pexels-backed feature (search returns an error the
// caller handles), not crash the whole process at import time.
let client: PexelsClient | null = null;

export function getPexelsClient(): PexelsClient {
	if (!client) {
		const apiKey = process.env.PEXELS_API_KEY;
		if (!apiKey) {
			throw new Error("Missing PEXELS_API_KEY in environment variables");
		}
		client = createClient(apiKey);
	}
	return client;
}
