import { sql } from "../db/client.ts";

/**
 * Per-owner catalog of S3-backed media assets, scoped by `kind` ('theme',
 * 'satisfying', ...). The bytes live in S3; this table holds the key, label and
 * optional kind-specific metadata. All queries take a `kind` so one table backs
 * several media libraries with identical CRUD.
 */

/** List/edit row. `category`/`durationSeconds` are null for kinds that omit them. */
export type MediaRow = {
	assetKey: string;
	displayName: string;
	category: string | null;
	durationSeconds: number | null;
};

/** Write payload. Optional metadata is only set by kinds that use it. */
export type MediaWrite = {
	assetKey: string;
	displayName: string;
	category?: string | null;
	durationSeconds?: number | null;
};

const nullIfEmpty = (v: string | null | undefined): string | null =>
	v && v.length ? v : null;

function toRow(r: Record<string, unknown>): MediaRow {
	return {
		assetKey: r.asset_key as string,
		displayName: (r.display_name as string | null) ?? "",
		category: (r.category as string | null) ?? null,
		durationSeconds:
			r.duration_seconds == null ? null : Number(r.duration_seconds),
	};
}

export const mediaRepo = {
	async list(ownerId: string, kind: string): Promise<MediaRow[]> {
		const rows = await sql`
			select asset_key, display_name, category, duration_seconds
			from media_assets
			where user_id = ${ownerId} and kind = ${kind}
			order by asset_key
		`;
		return rows.map(toRow);
	},

	async get(
		ownerId: string,
		kind: string,
		assetKey: string,
	): Promise<MediaRow | undefined> {
		const rows = await sql`
			select asset_key, display_name, category, duration_seconds
			from media_assets
			where user_id = ${ownerId} and kind = ${kind} and asset_key = ${assetKey}
			limit 1
		`;
		return rows.length ? toRow(rows[0]) : undefined;
	},

	async exists(
		ownerId: string,
		kind: string,
		assetKey: string,
	): Promise<boolean> {
		const rows = await sql`
			select 1 from media_assets
			where user_id = ${ownerId} and kind = ${kind} and asset_key = ${assetKey}
			limit 1
		`;
		return rows.length > 0;
	},

	async create(
		ownerId: string,
		kind: string,
		input: MediaWrite,
	): Promise<void> {
		await sql`
			insert into media_assets
				(user_id, kind, asset_key, display_name, category, duration_seconds)
			values (
				${ownerId}, ${kind}, ${input.assetKey},
				${nullIfEmpty(input.displayName)},
				${input.category ?? null}, ${input.durationSeconds ?? null}
			)
		`;
	},

	async update(
		ownerId: string,
		kind: string,
		assetKey: string,
		input: MediaWrite,
	): Promise<void> {
		await sql`
			update media_assets set
				display_name = ${nullIfEmpty(input.displayName)},
				category = ${input.category ?? null},
				duration_seconds = ${input.durationSeconds ?? null},
				updated_at = now()
			where user_id = ${ownerId} and kind = ${kind} and asset_key = ${assetKey}
		`;
	},

	async delete(ownerId: string, kind: string, assetKey: string): Promise<void> {
		await sql`
			delete from media_assets
			where user_id = ${ownerId} and kind = ${kind} and asset_key = ${assetKey}
		`;
	},
};
