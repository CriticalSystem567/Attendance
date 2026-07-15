# My Attendance Tracker

A shared Day Order calendar, weekly timetable, attendance tracker, and
assignment board for a class — now with real login. Log in and land
straight on the calendar: pick a date, see that day's classes, mark
attendance. Class/batch setup lives in the Profile tab, not the front
page. Your profile, attendance marks, and assignment status follow your
account across devices.

## 1. Create a Supabase project

1. Go to https://supabase.com and create a new project (free tier is fine).
2. Open the **SQL Editor** and run the contents of `schema.sql` — this
   creates `shared_data` (class timetables/assignments, visible to
   everyone who picks that class) and `user_data` (your own profile /
   attendance / assignment status, private to your account via RLS).
3. Go to **Authentication -> Providers** and confirm **Email** is
   enabled (it is by default). If you don't want new signups to require
   email confirmation, go to **Authentication -> Settings** and turn
   off "Confirm email".
4. Go to **Settings -> API** (or **Project Settings -> Data API**) and
   copy the **Project URL** and **anon / publishable** key.

## 2. Set up environment variables

```
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 3. Run locally

```
npm install
npm run dev
```

## 4. Deploy

Push this folder to GitHub, import it on Vercel, add the same two env
vars under **Settings -> Environment Variables**, then redeploy.

## How data is split

- **Shared** (timetable, Day Order calendar, assignments) — the
  `shared_data` table. Anyone logged in can read and edit it, since
  it's meant to be maintained collaboratively by classmates.
- **Personal** (your name/branch/batch, your attendance marks, your
  assignment status) — the `user_data` table, scoped to your account
  by Row Level Security. Only you can read or write your own rows.

## Still to come

The Day Order calendar and weekly timetable are currently empty on a
fresh account — the academic calendar and class timetable will be
added next and can be entered under the Timetable tab (or seeded
directly into `shared_data` via SQL) once finalized.
