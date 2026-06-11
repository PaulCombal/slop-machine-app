-- Generic media-asset library: a per-owner catalog of S3-backed media that
-- personae/groups/shows reference by key. One table with a `kind` discriminator
-- so different media types share the same CRUD/upload/preview machinery:
--
--   kind='theme'      → background music, S3 `assets/themes/<asset_key>.ogg`,
--                       referenced by the `theme` string on personae/groups/shows.
--   kind='satisfying' → filler video clips, S3 `assets/satisfying/<asset_key>.mp4`,
--                       grouped by `category`, seed-picked at render time. (The
--                       worker still reads a hardcoded list today; wiring it to
--                       this table is a follow-on.)
--
-- `category`/`duration_seconds` are nullable kind-specific metadata (used by
-- satisfying clips; themes leave them null). The actual bytes live in S3.

create table media_assets (
	id               uuid primary key default gen_random_uuid(),
	user_id          uuid not null references users(id) on delete cascade,
	kind             text not null,
	asset_key        text not null,
	display_name     text,
	category         text,
	duration_seconds integer,
	created_at       timestamptz not null default now(),
	updated_at       timestamptz not null default now(),
	unique (user_id, kind, asset_key)
);

create index media_assets_user_kind_idx on media_assets(user_id, kind);
