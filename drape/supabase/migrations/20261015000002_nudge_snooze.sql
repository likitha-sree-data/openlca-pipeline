-- "Keep it" on a nudge hides it until this date.
alter table garments add column if not exists nudge_snoozed_until date;
