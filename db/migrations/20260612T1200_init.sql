-- Phase 1 initial schema: users, sessions, and the editable definitions
-- (personae / persona_groups / shows) that previously lived only in code.
--
-- Every definition table carries a user_id FK and a per-tenant unique key, so
-- two owners can each have a persona called "peter". The two persona prompt
-- *functions* are stored as editable template TEXT (rendered with Eta at
-- runtime); the discriminated unions (stances, show split) are stored as jsonb.

create table users (
	id            uuid primary key default gen_random_uuid(),
	username      text unique not null,
	password_hash text not null,
	is_admin      boolean not null default false,
	created_at    timestamptz not null default now()
);

create table sessions (
	id         text primary key,
	user_id    uuid not null references users(id) on delete cascade,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null
);
create index sessions_user_id_idx on sessions(user_id);

create table personae (
	id            uuid primary key default gen_random_uuid(),
	user_id       uuid not null references users(id) on delete cascade,
	persona_key   text not null,
	asset_id      text,
	persona_name  text not null,
	language      text not null,
	theme         text not null default '',
	theme_volume  numeric not null default 0,
	tts_provider  text not null,
	elevenlabs_voice_id text not null default '',
	kokoro_voice_id     text not null default '',
	kokoro_language     text not null default '',
	qwen_voice_id       text not null default '',
	pocket_voice_id     text not null default '',
	pocket_use_voice_sample boolean not null default false,
	size               integer not null default 1000,
	pos_x_range        numeric not null default 0,
	pos_x_offset       numeric not null default 0,
	group_pos_x_range  numeric not null default 0,
	group_pos_x_offset numeric not null default 0,
	news_region        text not null default '',
	news_topics        text[] not null default '{}',
	yt_category_code   text not null default '',
	prompt_personality text not null default '',
	prompt_video_meta  text not null default '',
	prompt_video_meta_given_news_tmpl text not null default '',
	prompt_script_guidelines_tmpl     text not null default '',
	stances       jsonb not null default '[]',
	created_at    timestamptz not null default now(),
	updated_at    timestamptz not null default now(),
	unique (user_id, persona_key)
);

create table persona_groups (
	id            uuid primary key default gen_random_uuid(),
	user_id       uuid not null references users(id) on delete cascade,
	group_key     text not null,
	prompt        text not null default '',
	channel_id    text not null default '',
	platforms     text[] not null default '{}',
	theme         text not null default '',
	theme_volume  numeric not null default 0,
	satisfying_video_category text not null default '',
	end_padding_duration_ms   integer not null default 0,
	created_at    timestamptz not null default now(),
	updated_at    timestamptz not null default now(),
	unique (user_id, group_key)
);

create table persona_group_members (
	group_id   uuid not null references persona_groups(id) on delete cascade,
	persona_id uuid not null references personae(id) on delete restrict,
	position   integer not null default 0,
	primary key (group_id, persona_id)
);

create table shows (
	id            uuid primary key default gen_random_uuid(),
	user_id       uuid not null references users(id) on delete cascade,
	show_key      text not null,
	prose         text not null default '',
	prompt        text not null default '',
	split         jsonb not null default '{}',
	max_cast_per_episode integer not null default 0,
	channel_id    text not null default '',
	platforms     text[] not null default '{}',
	theme         text not null default '',
	theme_volume  numeric not null default 0,
	satisfying_video_category text not null default '',
	end_padding_duration_ms   integer not null default 0,
	yt_category_code text not null default '',
	created_at    timestamptz not null default now(),
	updated_at    timestamptz not null default now(),
	unique (user_id, show_key)
);

create table show_roster (
	show_id    uuid not null references shows(id) on delete cascade,
	persona_id uuid not null references personae(id) on delete restrict,
	position   integer not null default 0,
	primary key (show_id, persona_id)
);

-- One-row-per-flag guard table, mirroring the Valkey `schedulers:seeded` pattern
-- used by the worker for repeatable jobs.
create table seed_meta (
	key        text primary key,
	applied_at timestamptz not null default now()
);
