-- Drape initial schema.
-- Every table has RLS enabled and no policies for anon or authenticated,
-- so nothing is reachable through the Supabase REST API. The FastAPI server
-- connects with a privileged role and scopes every query by user_id.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key,
  email text,
  display_name text,
  is_admin boolean not null default false,
  is_demo boolean not null default false,
  demo_expires_at timestamptz,
  units text not null default 'c' check (units in ('c', 'f')),
  nudge_days int not null default 90 check (nudge_days between 14 and 730),
  notify_in_app boolean not null default true,
  notify_email boolean not null default false,
  study_opt_in boolean not null default false,
  keep_original_photos boolean not null default false,
  chat_photos_opt_in boolean not null default false,
  taste jsonb not null default '{}'::jsonb,
  storage_bytes bigint not null default 0,
  versatility_cache jsonb,
  created_at timestamptz not null default now()
);

create table if not exists garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  category text not null check (category in ('top', 'bottom', 'layer', 'dress', 'shoes', 'accessory')),
  subtype text,
  color_name text,
  color_hex text,
  hue real,
  sat real,
  val real,
  pattern text not null default 'solid',
  formality smallint not null default 1 check (formality between 1 and 3),
  warmth smallint not null default 2 check (warmth between 1 and 3),
  seasons text[] not null default '{}',
  fiber_content jsonb not null default '[]'::jsonb,
  care jsonb not null default '{}'::jsonb,
  price numeric(10, 2),
  purchased_on date,
  status text not null default 'active' check (status in ('active', 'for_sale', 'donate', 'keepsake', 'archived')),
  image_path text,
  thumb_path text,
  original_path text,
  care_label_path text,
  cutout_ok boolean not null default true,
  embedding vector(512),
  sha256 text,
  phash text,
  needs_review boolean not null default false,
  bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists garments_user_idx on garments (user_id, created_at desc);
create index if not exists garments_user_sha_idx on garments (user_id, sha256);

create table if not exists scan_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  result jsonb not null,
  image_path text,
  thumb_path text,
  original_path text,
  embedding vector(512),
  sha256 text,
  phash text,
  bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists scan_drafts_user_idx on scan_drafts (user_id, created_at);

create table if not exists outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text,
  occasion text,
  source text not null default 'generated' check (source in ('generated', 'chat', 'manual', 'photo', 'compare')),
  saved boolean not null default false,
  worn_on date,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists outfits_user_idx on outfits (user_id, created_at desc);
create index if not exists outfits_worn_idx on outfits (user_id, worn_on desc);

create table if not exists outfit_items (
  outfit_id uuid not null references outfits(id) on delete cascade,
  garment_id uuid not null references garments(id) on delete cascade,
  slot text not null check (slot in ('layer', 'top', 'bottom', 'dress', 'shoes', 'accessory')),
  primary key (outfit_id, garment_id)
);

create table if not exists wear_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  garment_id uuid not null references garments(id) on delete cascade,
  outfit_id uuid references outfits(id) on delete set null,
  worn_on date not null,
  source text not null check (source in ('manual', 'photo_confirmed')),
  confirmed_at timestamptz not null default now(),
  unique (garment_id, outfit_id)
);
create index if not exists wear_logs_user_idx on wear_logs (user_id, worn_on desc);
create index if not exists wear_logs_garment_idx on wear_logs (garment_id, worn_on desc);

create table if not exists outfit_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  outfit_id uuid not null references outfits(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('pending_review', 'confirmed')),
  detections jsonb not null default '[]'::jsonb,
  keep_original boolean not null default false,
  original_path text,
  segmenter text,
  bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_date date not null,
  occasion text,
  outfit_id uuid references outfits(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists color_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  favorites text[] not null default '{}',
  avoid text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists color_profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  path text not null,
  palette jsonb not null default '[]'::jsonb,
  bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source_url text,
  title text,
  price numeric(10, 2),
  image_path text,
  category text,
  color text,
  color_hex text,
  scan jsonb not null default '{}'::jsonb,
  embedding vector(512),
  similar_ids uuid[] not null default '{}',
  similar_items jsonb not null default '[]'::jsonb,
  works_with_ids uuid[] not null default '{}',
  new_outfit_count int not null default 0,
  bytes bigint not null default 0,
  condition text not null default 'treatment' check (condition in ('control', 'treatment')),
  decision text check (decision in ('save', 'keep_browsing')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reviews_user_idx on reviews (user_id, created_at desc);

create table if not exists waiting_list (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references reviews(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  due_at timestamptz not null,
  notified_at timestamptz,
  status text not null default 'waiting' check (status in ('waiting', 'bought', 'skipped', 'thinking')),
  note text,
  answered_at timestamptz
);
create index if not exists waiting_due_idx on waiting_list (due_at) where notified_at is null;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  emailed boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  outfit jsonb,
  garment_ids uuid[] not null default '{}',
  provider text,
  created_at timestamptz not null default now()
);
create index if not exists chat_user_idx on chat_messages (user_id, created_at);

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('study', 'color_profile', 'chat_photos', 'email')),
  version text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index if not exists consents_user_idx on consents (user_id, kind);

-- Research layer. No names, emails or image paths live here.
create table if not exists study_state (
  id int primary key default 1 check (id = 1),
  next_index int not null default 0
);
insert into study_state (id, next_index) values (1, 0) on conflict do nothing;

create table if not exists study_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  code text not null unique,
  design text not null,
  alloc_index int not null,
  block_index int not null,
  arm text not null,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  review_count int not null default 0
);

create table if not exists study_events (
  id bigserial primary key,
  participant_id uuid not null references study_participants(id) on delete cascade,
  review_id uuid references reviews(id) on delete set null,
  condition text,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists study_decisions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references study_participants(id) on delete cascade,
  review_id uuid unique references reviews(id) on delete set null,
  trial_index int not null,
  condition text not null,
  decision text not null check (decision in ('save', 'keep_browsing')),
  reasons text[] not null default '{}',
  reason_other text,
  confidence smallint not null check (confidence between 1 and 7),
  shown_at timestamptz not null,
  decided_at timestamptz not null default now(),
  time_on_page_ms int not null,
  similar_count int,
  new_outfit_count int
);

create table if not exists study_followups (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references study_decisions(id) on delete cascade,
  bought text not null check (bought in ('yes', 'no', 'unsure')),
  still_want smallint check (still_want between 1 and 7),
  created_at timestamptz not null default now()
);

create table if not exists study_task_timers (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references study_participants(id) on delete cascade,
  task text not null check (task in ('setup', 'outfit_choice', 'purchase_review', 'photo_matching')),
  started_at timestamptz not null,
  ended_at timestamptz,
  completed boolean
);

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'garments', 'scan_drafts', 'outfits', 'outfit_items', 'wear_logs', 'outfit_photos',
    'plans', 'color_prefs', 'color_profile_photos', 'reviews', 'waiting_list', 'notifications',
    'chat_messages', 'consents', 'study_state', 'study_participants', 'study_events',
    'study_decisions', 'study_followups', 'study_task_timers'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Private storage buckets, only on Supabase where the storage schema exists.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('garments', 'garments', false),
           ('outfit-photos', 'outfit-photos', false),
           ('review-items', 'review-items', false),
           ('profile-photos', 'profile-photos', false)
    on conflict (id) do update set public = false;
  end if;
end $$;
