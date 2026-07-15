# My Attendance Tracker

A shared Day Order calendar, weekly timetable, attendance tracker, and
assignment board for a class — with username-based login. Log in with
just a username and password (no email needed) and land straight on
the calendar: pick a date, see that day's classes, mark attendance.
Class/batch setup lives in the Profile tab, not the front page. Your
profile, attendance marks, and assignment status follow your account
across devices.

## 1. Create a Supabase project

1. Go to https://supabase.com and create a new project (free tier is fine).
2. Open the **SQL Editor** and run the contents of `schema.sql` — this
   creates `shared_data` (class timetables/assignments, visible to
   everyone who picks that class) and `user_data` (your own profile /
   attendance / assignment status, private to your account via RLS).
3. Go to **Authentication -> Providers** and confirm **Email** is
   enabled (it is by default).
4. **Important — required for username login:** go to
   **Authentication -> Settings** (or **Sign In / Providers -> Email**)
   and turn **off "Confirm email"**. The app turns each username into
   a private, made-up email address behind the scenes (e.g.
   `yogeswar_k@dayorder.local`) purely so Supabase's login system has
   something to store — nobody can ever receive mail at that address,
   so if email confirmation is left on, new accounts will never be
   able to confirm and log in.
5. Go to **Settings -> API** (or **Project Settings -> Data API**) and
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

## How login works

Signup/login only ever ask for a **username** (3–20 letters, numbers,
underscores or dots) and a password. Internally this maps to
`<username>@dayorder.local` for Supabase Auth, so usernames are
guaranteed unique the same way emails are. The real "email" is never
shown anywhere in the UI — Profile shows the username instead.

## How data is split

- **Shared** (timetable, Day Order calendar, assignments) — the
  `shared_data` table. Anyone logged in can read and edit it, since
  it's meant to be maintained collaboratively by classmates.
- **Personal** (your name/branch/batch, your attendance marks, your
  assignment status) — the `user_data` table, scoped to your account
  by Row Level Security. Only you can read or write your own rows.

## Calendar tab

A new **Calendar** tab shows a full year at a glance (tap a month to
zoom into it, tap any date to jump straight to that day in Today).
Saturdays/Sundays and India's gazetted public holidays for 2026 are
each shaded in their own colour (see the legend at the top), and once
your class's Day Order calendar is set up, weekday cells also show
their Day Order number. The holiday list lives in `src/holidays.js` —
edit that file to add regional/state holidays or update it for a new
year.

## Still to come

The Day Order calendar and weekly timetable are currently empty on a
fresh account — the academic calendar and class timetable will be
added next and can be entered under the Timetable tab (or seeded
directly into `shared_data` via SQL) once finalized.

