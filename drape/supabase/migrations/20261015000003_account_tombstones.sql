-- Sessions issued before an account was deleted must not recreate it.
-- Only the user id and the time are kept, no personal data.
create table if not exists account_tombstones (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);
alter table account_tombstones enable row level security;
