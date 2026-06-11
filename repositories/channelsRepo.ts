import type { Credentials } from "google-auth-library";
import { sql } from "../db/client.ts";

/**
 * Per-channel publishing credentials, scoped per owner. Token refresh uses an
 * atomic single-row UPDATE (no read-modify-write race on a shared file).
 * `list`/`form` expose presence flags only — secrets never reach the UI.
 */

/** IG login pair stored for the auto-post service. */
export type IgCredentials = { username: string; password: string };

/** Non-secret channel view for lists (UI never sees the secrets). */
export type ChannelSummary = {
	channelKey: string;
	displayName: string | null;
	hasGoogleTokens: boolean;
	igUsername: string | null;
	hasIgPassword: boolean;
};

/** Edit-form prefill (non-secret fields only). */
export type ChannelForm = {
	channelKey: string;
	displayName: string;
	igUsername: string;
	hasGoogleTokens: boolean;
	hasIgPassword: boolean;
};

/** Write payload. Secret fields are optional: omit to keep the existing value. */
export type ChannelInput = {
	channelKey: string;
	displayName: string;
	igUsername: string;
	igPassword?: string;
	googleTokens?: Credentials;
};

export const channelsRepo = {
	async listByOwner(ownerId: string): Promise<ChannelSummary[]> {
		const rows = await sql`
			select channel_key, display_name,
				(google_tokens is not null) as has_google_tokens,
				ig_username,
				(ig_password is not null and ig_password <> '') as has_ig_password
			from channels where user_id = ${ownerId} order by channel_key
		`;
		return rows.map((r: Record<string, unknown>) => ({
			channelKey: r.channel_key as string,
			displayName: (r.display_name as string | null) ?? null,
			hasGoogleTokens: Boolean(r.has_google_tokens),
			igUsername: (r.ig_username as string | null) ?? null,
			hasIgPassword: Boolean(r.has_ig_password),
		}));
	},

	async formByOwner(
		ownerId: string,
		channelKey: string,
	): Promise<ChannelForm | undefined> {
		const rows = await sql`
			select channel_key, display_name, ig_username,
				(google_tokens is not null) as has_google_tokens,
				(ig_password is not null and ig_password <> '') as has_ig_password
			from channels where user_id = ${ownerId} and channel_key = ${channelKey} limit 1
		`;
		if (!rows.length) return undefined;
		const r = rows[0];
		return {
			channelKey: r.channel_key,
			displayName: r.display_name ?? "",
			igUsername: r.ig_username ?? "",
			hasGoogleTokens: Boolean(r.has_google_tokens),
			hasIgPassword: Boolean(r.has_ig_password),
		};
	},

	// ---- credentials (consumed by the worker / auto-post) ---------------

	async getGoogleTokens(
		ownerId: string,
		channelKey: string,
	): Promise<Credentials | null> {
		const rows = await sql`
			select google_tokens from channels
			where user_id = ${ownerId} and channel_key = ${channelKey} limit 1
		`;
		if (!rows.length) return null;
		const t = rows[0].google_tokens;
		if (t == null) return null;
		return (typeof t === "string" ? JSON.parse(t) : t) as Credentials;
	},

	/** Atomic per-row token write (used on initial grab AND on auto-refresh). */
	async setGoogleTokens(
		ownerId: string,
		channelKey: string,
		tokens: Credentials,
	): Promise<void> {
		await sql`
			insert into channels (user_id, channel_key, google_tokens)
			values (${ownerId}, ${channelKey}, ${JSON.stringify(tokens)}::jsonb)
			on conflict (user_id, channel_key)
			do update set google_tokens = ${JSON.stringify(tokens)}::jsonb, updated_at = now()
		`;
	},

	async getIgCredentials(
		ownerId: string,
		channelKey: string,
	): Promise<IgCredentials | null> {
		const rows = await sql`
			select ig_username, ig_password from channels
			where user_id = ${ownerId} and channel_key = ${channelKey} limit 1
		`;
		if (!rows.length) return null;
		const { ig_username, ig_password } = rows[0];
		if (!ig_username || !ig_password) return null;
		return { username: ig_username, password: ig_password };
	},

	// ---- CRUD (control plane) -------------------------------------------

	async exists(ownerId: string, channelKey: string): Promise<boolean> {
		const rows = await sql`
			select 1 from channels where user_id = ${ownerId} and channel_key = ${channelKey} limit 1
		`;
		return rows.length > 0;
	},

	async create(ownerId: string, input: ChannelInput): Promise<void> {
		await sql`
			insert into channels (user_id, channel_key, display_name, ig_username, ig_password, google_tokens)
			values (
				${ownerId}, ${input.channelKey}, ${nullIfEmpty(input.displayName)},
				${nullIfEmpty(input.igUsername)}, ${input.igPassword ?? null},
				${input.googleTokens ? JSON.stringify(input.googleTokens) : null}::jsonb
			)
		`;
	},

	/** Update non-secret fields always; secrets only when a new value is given. */
	async update(
		ownerId: string,
		channelKey: string,
		input: ChannelInput,
	): Promise<void> {
		await sql`
			update channels set
				display_name = ${nullIfEmpty(input.displayName)},
				ig_username = ${nullIfEmpty(input.igUsername)},
				ig_password = case when ${input.igPassword ?? null}::text is not null
					then ${input.igPassword ?? null} else ig_password end,
				google_tokens = case when ${input.googleTokens ? JSON.stringify(input.googleTokens) : null}::jsonb is not null
					then ${input.googleTokens ? JSON.stringify(input.googleTokens) : null}::jsonb else google_tokens end,
				updated_at = now()
			where user_id = ${ownerId} and channel_key = ${channelKey}
		`;
	},

	async delete(ownerId: string, channelKey: string): Promise<void> {
		await sql`delete from channels where user_id = ${ownerId} and channel_key = ${channelKey}`;
	},
};

function nullIfEmpty(v: string): string | null {
	return v && v.length ? v : null;
}
