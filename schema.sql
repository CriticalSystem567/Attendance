-- DayOrder shared data store.
-- One table holds every piece of shared (cross-device) data as a
-- key/value pair, mirroring the original app's "shared" storage scope:
--   branches, branch__<slug>__config, branch__<slug>__common,
--   branch__<slug>__batch1, branch__<slug>__batch2,
--   branch__<slug>__assignments
--
-- Personal data (profile, attendance, assignment status) is NOT stored
-- here — it lives in each user's browser localStorage instead.

create table if not exists shared_data (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on every write.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shared_data_touch on shared_data;
create trigger shared_data_touch
before update on shared_data
for each row execute function set_updated_at();

-- Row Level Security: this app has no login system, so every visitor
-- uses the same public anon key. Anyone with the link can read and
-- write shared timetable/assignment data — that's expected, since
-- it's meant to be edited collaboratively by classmates.
alter table shared_data enable row level security;

create policy "public read" on shared_data
  for select using (true);

create policy "public write" on shared_data
  for insert with check (true);

create policy "public update" on shared_data
  for update using (true);

-- Personal data, scoped per logged-in user (profile, attendance marks,
-- assignment submission status). Requires Supabase Auth (email/password,
-- enabled by default on new projects).

create table if not exists user_data (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

drop trigger if exists user_data_touch on user_data;
create trigger user_data_touch
before update on user_data
for each row execute function set_updated_at();

alter table user_data enable row level security;

create policy "own read" on user_data
  for select using (auth.uid() = user_id);

create policy "own insert" on user_data
  for insert with check (auth.uid() = user_id);

create policy "own update" on user_data
  for update using (auth.uid() = user_id);

-- Needed for the "Delete all my data" feature — without this, RLS
-- silently blocks every delete and the button does nothing.
create policy "own delete" on user_data
  for delete using (auth.uid() = user_id);

-- Username -> real email lookup.
--
-- Supabase Auth is fundamentally email/password; this app only ever
-- shows a "username" though, and originally faked an email as
-- "username@dayorder.local" so login could work off just a username.
-- That trick means Supabase's native password-reset email has nowhere
-- real to send to. This table maps each username to the person's real
-- email (collected at signup) so:
--   - signIn(username) can look up the real email and sign in with it
--   - "forgot password" can look up the real email and send a genuine
--     Supabase reset email to it
-- Accounts created before this table existed won't have a row here —
-- the app falls back to the old synthetic-email login for them until
-- they add a recovery email from Profile.
create table if not exists usernames (
  username   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

alter table usernames enable row level security;

-- Needs to be publicly readable: looking up the email for a username
-- has to work *before* the person is signed in (that's the whole point
-- of login/forgot-password). Matches this app's existing permissive
-- model (shared_data is public read/write too) rather than adding real
-- auth infrastructure for a small class-group tool.
create policy "public read" on usernames
  for select using (true);

create policy "public insert" on usernames
  for insert with check (true);

create policy "own update" on usernames
  for update using (auth.uid() = user_id);
