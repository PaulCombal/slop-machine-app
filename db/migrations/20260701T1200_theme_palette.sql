-- Per-sentence theme palette. Until now a persona/group/show had a single
-- `theme` (one looping background track for the whole video). To let the mood
-- change per line (action, dramatic, sad…), the breakdown/scriptwriter now
-- assigns an optional theme to each sentence — but only from a palette the user
-- curates here. `theme` stays as the BASE track played on lines with no theme.
-- The palette is a jsonb array of theme asset keys (media_assets, kind='theme').
alter table personae       add column themes jsonb not null default '[]'::jsonb;
alter table persona_groups add column themes jsonb not null default '[]'::jsonb;
alter table shows          add column themes jsonb not null default '[]'::jsonb;
