# DayOrder — Attendance Tracker

A shared Day Order calendar, weekly timetable, attendance tracker, and
assignment board for a class. Anyone in the class can view and edit the
shared timetable/assignments; each person's own attendance marks stay
on their own device.

## 1. Create a Supabase project

1. Go to https://supabase.com and create a new project (free tier is fine).
2. Open the **SQL Editor** and run the contents of `schema.sql` from this
   repo — this creates the one table the app needs (`shared_data`).
3. Go to **Settings -> API** (or **Project Settings -> Data API**) and copy:
   - **Project URL**
   - **anon public** key

## 2. Set up environment variables

```
cp .env.example .env
```

Open `.env` and paste in your Project URL and anon key:

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

Push this folder to a GitHub repo, then import it on Vercel. On Vercel, go
to **Project Settings -> Environment Variables** and add the same two
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` values, then redeploy.

## How data is split

- **Shared** (timetable, Day Order calendar, assignments) — stored in the
  `shared_data` table in Supabase. Anyone with the link can read and edit
  it, since it's meant to be maintained collaboratively by classmates.
- **Personal** (your name/branch/batch, your attendance marks, your
  assignment status) — stored in this browser's `localStorage`. It does
  not sync across devices or browsers.
