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
