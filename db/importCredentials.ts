import { channelsRepo } from "../repositories/channelsRepo.ts";
import { sql } from "./client.ts";
import { ensureAdminUser } from "./users.ts";

/**
 * One-time, idempotent import of the S3 credential files into the `channels`
 * table (admin tenant): credentials/google_tokens.json + ig_accounts.json. The
 * S3 files are left in place — delete them once you've confirmed the DB has them.
 *
 *   bun run import-credentials
 */

type IgAccount = { username: string; password: string };

async function readJson<T>(key: string): Promise<T | null> {
	const file = Bun.s3.file(key);
	if (!(await file.exists())) return null;
	return (await file.json()) as T;
}

async function main() {
	const admin = await ensureAdminUser();

	const google = (await readJson<Record<string, unknown>>(
		"credentials/google_tokens.json",
	)) ?? {};
	const ig = (await readJson<Record<string, IgAccount>>(
		"credentials/ig_accounts.json",
	)) ?? {};

	const keys = new Set([...Object.keys(google), ...Object.keys(ig)]);
	if (!keys.size) {
		console.log("No credentials found in S3 — nothing to import.");
		return;
	}

	for (const channelKey of keys) {
		// Ensure a row exists (non-secret fields), then layer in whatever secrets
		// S3 has for this channel.
		if (!(await channelsRepo.exists(admin.id, channelKey))) {
			await channelsRepo.create(admin.id, {
				channelKey,
				displayName: "",
				igUsername: ig[channelKey]?.username ?? "",
				igPassword: ig[channelKey]?.password,
			});
		} else if (ig[channelKey]) {
			await channelsRepo.update(admin.id, channelKey, {
				channelKey,
				displayName: "",
				igUsername: ig[channelKey].username,
				igPassword: ig[channelKey].password,
			});
		}

		if (google[channelKey]) {
			await channelsRepo.setGoogleTokens(
				admin.id,
				channelKey,
				google[channelKey] as never,
			);
		}

		const bits = [
			google[channelKey] ? "google" : null,
			ig[channelKey] ? "ig" : null,
		].filter(Boolean);
		console.log(`✅ imported "${channelKey}" (${bits.join(", ")})`);
	}

	console.log(`Done — ${keys.size} channel(s) imported into the DB.`);
}

if (import.meta.main) {
	await main();
	await sql.end();
}
