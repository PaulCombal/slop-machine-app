-- Whether a persona's artwork may be flipped horizontally (per-stance facing
-- rides inside the existing stances JSONB).
alter table personae add column mirrorable boolean not null default false;
