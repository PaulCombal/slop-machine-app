-- A reusable default image prompt for a persona's stances (the character's look),
-- editable on the stance gallery and pre-filled into the studio's generate box.
-- Also populated by the "generate personae from prose" flow for shows.
alter table personae add column stance_default_prompt text not null default '';
