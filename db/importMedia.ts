import { mediaRepo } from "../repositories/media.ts";
import { sql } from "./client.ts";
import { ensureAdminUser } from "./users.ts";

/**
 * One-time, idempotent import of the media files already living in S3 into the
 * `media_assets` table (admin tenant): the background-music themes under
 * assets/themes/<key>.ogg and the satisfying filler clips under
 * assets/satisfying/<key>.mp4. Only files that actually exist in S3 are
 * imported, and rows that already exist are left untouched. The S3 objects are
 * not moved.
 *
 *   bun run import-media
 */

type ThemeSeed = { key: string };
type SatisfyingSeed = { key: string; category: string; durationSeconds: number };

// Known keys from the code registries / local assets. Existence is verified
// against S3 below, so listing one that was never uploaded is harmless.
const THEMES: ThemeSeed[] = [{ key: "debug" }, { key: "jazz" }];

// Mirrors the built-in S3 clips in steps/download_satisfying.mts (durations and
// categories the renderer expects).
const SATISFYING: SatisfyingSeed[] = [
	{ key: "surfer", category: "gameplay", durationSeconds: 60 * 3 },
	{ key: "Minecraft", category: "gameplay", durationSeconds: 60 * 15 },
	{ key: "usflag", category: "america", durationSeconds: 110 },
];

async function importKind(
	ownerId: string,
	kind: string,
	s3Path: (key: string) => string,
	items: Array<{ key: string; category?: string; durationSeconds?: number }>,
): Promise<void> {
	for (const item of items) {
		const path = s3Path(item.key);
		if (!(await Bun.s3.file(path).exists())) {
			console.log(`⏭️  skip ${kind} "${item.key}" — no S3 file at ${path}`);
			continue;
		}
		if (await mediaRepo.exists(ownerId, kind, item.key)) {
			console.log(`↩️  ${kind} "${item.key}" already in DB`);
			continue;
		}
		await mediaRepo.create(ownerId, kind, {
			assetKey: item.key,
			displayName: item.key,
			category: item.category ?? null,
			durationSeconds: item.durationSeconds ?? null,
		});
		console.log(`✅ imported ${kind} "${item.key}"`);
	}
}

async function main() {
	const admin = await ensureAdminUser();

	await importKind(
		admin.id,
		"theme",
		(k) => `assets/themes/${k}.ogg`,
		THEMES,
	);
	await importKind(
		admin.id,
		"satisfying",
		(k) => `assets/satisfying/${k}.mp4`,
		SATISFYING,
	);

	console.log("Done.");
}

if (import.meta.main) {
	await main();
	await sql.end();
}
