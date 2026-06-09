import type { SeriesManifest } from "../steps/generate_series.mts";

const manifestKey = (showId: string) => `shows/${showId}/manifest.json`;

export async function loadManifest(
	showId: string,
): Promise<SeriesManifest | null> {
	const file = Bun.s3.file(manifestKey(showId));
	if (!(await file.exists())) {
		return null;
	}
	return (await file.json()) as SeriesManifest;
}

export async function saveManifest(manifest: SeriesManifest): Promise<void> {
	await Bun.s3.write(
		manifestKey(manifest.showId),
		JSON.stringify(manifest, null, 2),
	);
}
