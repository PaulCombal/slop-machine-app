-- Show lifecycle: a show is editable while 'draft', frozen once its prose is
-- broken into episodes. 'breaking_down' is the transient state while the
-- breakdown job runs; 'in_production' once the manifest exists. Existing rows
-- start as 'draft' (re-break to lock them).
alter table shows add column status text not null default 'draft';
