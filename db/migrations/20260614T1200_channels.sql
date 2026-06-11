-- Per-channel publishing credentials, previously kept in S3 as shared JSON
-- (credentials/google_tokens.json, credentials/ig_accounts.json). Moving them
-- here makes channels first-class, owned entities (per-tenant) and removes the
-- read-modify-write race on the shared google_tokens.json file: each channel's
-- tokens are now an independent row, refreshed with an atomic UPDATE.
--
-- The large Instagram browser-profile tarballs stay in S3 (object storage) —
-- only the small structured secrets live here.

create table channels (
	id            uuid primary key default gen_random_uuid(),
	user_id       uuid not null references users(id) on delete cascade,
	channel_key   text not null,
	display_name  text,
	-- YouTube / Google OAuth credentials ({access_token, refresh_token, ...}).
	google_tokens jsonb,
	-- Instagram login for the auto-post service.
	ig_username   text,
	ig_password   text,
	created_at    timestamptz not null default now(),
	updated_at    timestamptz not null default now(),
	unique (user_id, channel_key)
);

create index channels_user_id_idx on channels(user_id);
