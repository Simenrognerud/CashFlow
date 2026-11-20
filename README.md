# Skiftlønn

An iPhone web app (PWA) for logging shifts and seeing what next month's pay comes to after tax.
The interface is in Norwegian. Hosting is free: Vercel for the app, Supabase for login, database and the calendar feed.

## 1. Try it locally (demo mode, no setup)

```bash
npm install
npm run dev        # opens http://localhost:5173; also reachable on your local network
npm test           # pay calculation tests
```

Without a `.env` file the app runs in **demo mode** and keeps its data in the browser.

## 2. Supabase (login + database)

1. Create a free project at <https://supabase.com>. Pick the **Stockholm (eu-north-1)** region, since it's the closest to Norway.
2. Go to **SQL Editor → New query**, paste in all of `supabase/schema.sql` and click **Run**.
3. Go to **Authentication → Sign In / Providers → Email** and **turn off "Confirm email"**.
   (The app stores users as `username@skiftlonn.app`. No email is ever sent and no personal data is collected.)
4. Go to **Project Settings → API**, copy the *Project URL* and the *anon public* key, and put them in a `.env` file:
   ```bash
   cp .env.example .env   # then fill in both values
   ```
5. Deploy the calendar feed. Your project ref is the `xxxx` in `xxxx.supabase.co`.
   ```bash
   npx supabase login
   npx supabase functions deploy calendar-feed --project-ref <ref> --no-verify-jwt
   ```
   `--no-verify-jwt` is required because the iPhone calendar can't log in. Access is controlled by the secret `feed_token` in the link instead.

## 3. Publish (Vercel)

1. Push the project to a GitHub repo.
2. On <https://vercel.com>, choose **Add New → Project**, import the repo, and add the two `VITE_SUPABASE_*` variables under *Environment Variables*. Then **Deploy**.
3. You get an address like `skiftlonn.vercel.app`. Every `git push` deploys a new version automatically.

## 4. Keep Supabase awake

Supabase pauses free projects after about a week with no activity.
In your GitHub repo, go to **Settings → Secrets and variables → Actions** and add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
The workflow in `.github/workflows/keep-alive.yml` then pings the database every three days.
You can test it by going to **Actions → Keep Supabase awake → Run workflow**.

## 5. On her iPhone

1. Open the Vercel address in **Safari**, then tap **Share → Add to Home Screen**.
2. Open the app from the home screen, create an account, and under **Innstillinger** enter the hourly wage and tax percentage.
3. Under **Vakter**, create templates such as "Dagvakt" and "Kveldsvakt", with bonuses like "+30 kr/t after 18:00" and a weekend bonus.
4. In **Innstillinger → iPhone-kalender**, tap **Abonner i Kalender** once. From then on, shifts show up in the Calendar app automatically.

## How the pay calculation works

- Each shift is split per calendar day, so night shifts that run past midnight are handled correctly.
- A bonus rule has a kr/hour amount, an optional time window (`from`–`to`) and which days it applies to (all days, weekends only or weekdays only).
  Only the hours of the shift that fall inside the window get the bonus, and several rules can apply at once.
- Tax is stored with a "valid from" month (*gjelder fra*). Changing the tax rate only affects that month and later ones, so past months keep their numbers.
- The settings page has a calculator that works out the percentage from a payslip (`tax withheld / gross`).
- A shift saves a copy of its template when it's added. Editing a template later doesn't change shifts that are already in the calendar.

All the calculation logic is in `src/lib/pay.js`, with tests in `src/lib/pay.test.js`.

## Structure

```
src/
  lib/pay.js            pay calculation (pure functions)
  lib/api.js            data layer: Supabase or demo mode
  components/           calendar, shift templates, settings, login
supabase/
  schema.sql            tables + Row Level Security
  functions/calendar-feed/index.ts   .ics feed for the iPhone calendar
.github/workflows/keep-alive.yml
```
