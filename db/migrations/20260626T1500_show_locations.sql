-- Per-show locations ("rooms"): named places a scene can happen in (kitchen,
-- garden, confessional…). Each carries one chosen background asset (image or
-- video) stored in S3 at `locations/<show_key>/<location_key>.<ext>`. Phase 2
-- will tag each script line with a location_key so the right backdrop renders;
-- until then these are purely an authoring artefact with no render impact.
create table show_locations (
	id            uuid primary key default gen_random_uuid(),
	show_id       uuid not null references shows(id) on delete cascade,
	location_key  text not null,
	name          text not null default '',
	description   text not null default '',
	-- The chosen background asset. NULL kind = no asset picked yet.
	asset_kind    text,            -- 'image' | 'video'
	asset_ext     text,            -- 'png' | 'jpg' | 'mp4' | 'webm'
	source        text,            -- 'pexels' | 'upload' | 'ai'
	position      integer not null default 0,
	created_at    timestamptz not null default now(),
	unique (show_id, location_key)
);
create index show_locations_show_id_idx on show_locations(show_id);
