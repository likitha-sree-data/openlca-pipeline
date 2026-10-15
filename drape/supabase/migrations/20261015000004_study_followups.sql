-- Follow-up reminders for "Keep browsing" decisions, so every decision gets a later purchase check.
alter table study_decisions add column if not exists followup_notified_at timestamptz;
