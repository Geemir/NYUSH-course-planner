# Deploying the NYUSH Course Planner for user testing

Recommended stack: **Vercel** (hosting — the app is a single Next.js 16 project)
+ **Neon** (managed Postgres, free tier). Both have free tiers comfortable for a
student pilot (tens of users). Total setup time: roughly an afternoon.

> The app is **local-database-first by design**: every page load reads only from
> your Postgres catalog (`/api/catalog/*`). The NYU Bulletin is contacted *only*
> when an admin runs `bulletin:sync`, and Albert only when an admin uses the
> import tool. Users never trigger external fetches.

---

## 1. Create the database (Neon)

1. <https://neon.tech> → new project (choose a region near your users, e.g.
   Singapore for Shanghai testers).
2. Copy the **pooled** connection string (`postgres://…-pooler…/neondb`).
3. Apply the schema from your machine:

   ```powershell
   $env:DATABASE_URL = "postgres://…your-neon-url…"
   npx.cmd drizzle-kit migrate    # applies the ordered SQL in drizzle/
   ```

   (For a disposable test DB, `npm.cmd run db:push` also works, but migrations
   are the reviewable path.)

## 2. Load the catalog

Pick one (both write only to your database):

- **Fastest — seed the recovery catalog** (810 NYUSH courses + 43 programs,
  checked into the repo, no scraping):

  ```powershell
  $env:DATABASE_URL = "postgres://…"
  npm.cmd run db:seed
  ```

- **Full — sync the live Bulletin** (NYUSH + 13 New York schools; takes
  ~10 minutes and needs the NY sources to be healthy):

  ```powershell
  $env:DATABASE_URL = "postgres://…"
  npm.cmd run bulletin:sync
  ```

You can start with `db:seed` today and run `bulletin:sync` later — a successful
sync atomically supersedes the seeded release, and users' plans re-point to the
new release automatically.

## 3. Create the Vercel project

1. Push the repo to GitHub (double-check `.env.local` is **not** committed — it
   is gitignored).
2. <https://vercel.com> → Add New Project → import the repo. Framework preset:
   Next.js (auto-detected). No custom build settings needed.
3. Set the environment variables (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled connection string |
   | `AUTH_SECRET` | a **fresh** secret: `npx auth secret` or `openssl rand -base64 32` — do not reuse the dev one |
   | `AUTH_URL` | `https://<your-project>.vercel.app` (or your custom domain) |
   | `ADMIN_EMAILS` | comma-separated `@nyu.edu` addresses that get the admin panel |
   | `DEEPSEEK_API_KEY` | only if admins will use the AI import/rules tools |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | after step 4 |

4. Deploy. The site will come up, but **sign-in needs step 4**. Google is the
   only active provider; the disabled email action remains labeled as in
   development in every environment.

## 4. Wire real sign-in (Google OAuth)

NYU student email runs on Google Workspace, so Google sign-in matches the
account testers already have. The `@nyu.edu` gate in `src/auth.ts` rejects
personal Gmail accounts server-side regardless of who authenticates.

1. <https://console.cloud.google.com> → new project →
   **APIs & Services → OAuth consent screen**: External. App name, your contact
   email. Scopes: only the default `email` / `profile` / `openid` (these need no
   Google verification review).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`
   - (Optionally also `http://localhost:3000/api/auth/callback/google` for
     testing the prod flow locally.)
3. Put the client id/secret into Vercel as `AUTH_GOOGLE_ID` /
   `AUTH_GOOGLE_SECRET` and redeploy. The Google button appears automatically.

**Testing-mode note:** while the consent screen is in "Testing" status, only
users you list (up to 100) can sign in — add your testers' `@nyu.edu`
addresses, which is fine (arguably good) for a pilot. Publish the app when you
want open access.

Email magic links are intentionally out of scope for this release. Do not add a
fallback provider without restoring the server-side NYU identity and abuse
controls in a separately reviewed change.

## 5. Smoke-test the deployment

1. Open the site logged out → catalog loads (if you get "catalog unavailable",
   step 2 didn't run against the right `DATABASE_URL`).
2. Search `CSCI-SHU 210` → Data Structures appears first; place it; refresh —
   the plan persists (guest/localStorage mode).
3. Sign in with a listed `@nyu.edu` account → the local plan imports; edit,
   then open the site in a private window, sign in again → the edit is there
   (server sync). A non-NYU Google account must be rejected.
4. Sign in with an `ADMIN_EMAILS` address → `/admin` is reachable; for everyone
   else it 403s.
5. Open the Program Profile, pick a major + minor, confirm progress rings and
   the feasibility check respond.
6. From Plan actions, download JSON, Excel, and PDF. Open all three; confirm the
   workbook has three sheets and the PDF has schedule/progress pages.
7. As an administrator, save and publish an announcement. Verify it appears
   below the planner header on desktop and mobile, can be dismissed, and that a
   later announcement with a new ID appears again.

## 6. Operating it during the pilot

- **Catalog refresh:** run `bulletin:sync` from your machine against the prod
  `DATABASE_URL` whenever you want fresher data (e.g. weekly). It fails closed:
  a bad scrape keeps the previous healthy release active. There is deliberately
  no cron — refresh is a manual admin action for now.
- **Backups:** Neon keeps point-in-time restore on paid tiers; on the free tier
  take an occasional `pg_dump`. User plans are the only irreplaceable data.
- **Monitoring:** Vercel → Logs. The two errors worth alerts are
  `catalog_unavailable` (release missing) and Auth.js `UntrustedHost` (fix
  `AUTH_URL`).
- **Feedback:** point testers at the in-app **Report catalog issue** button —
  reports land in the admin Correction Hub with full context.
- **Announcements:** use `/admin` to draft, publish, or withdraw the one global
  notice. Announcement history is retained; users dismiss each notice locally.

## Announcement migration and deployment order

The announcement table migration must be applied to Neon before deploying the
application build that calls its APIs. Review `drizzle/0007_previous_absorbing_man.sql`,
then run these commands from a trusted operator machine; never paste the real
connection string into source control or logs:

```powershell
$env:DATABASE_URL = '<Neon pooled connection string>'
npx.cmd drizzle-kit migrate
npm.cmd run build
```

Only after both commands succeed should the operator push `main` and allow the
Vercel deployment. This repository task does not run the production migration,
push GitHub, or deploy Vercel. After deployment, smoke-test Google sign-in,
announcement publish/dismiss, Excel/PDF downloads, 390px mobile layout, and the
system reduced-motion preference.

## Common failure modes

| Symptom | Cause / fix |
|---|---|
| Catalog stuck "loading", API 503 `catalog_unavailable` | No active catalog release in the DB → run step 2 against the prod `DATABASE_URL`. |
| Sign-in shows Google unavailable | `AUTH_GOOGLE_ID`/`SECRET` is unset or invalid; email is not a fallback provider. |
| Auth.js `UntrustedHost` error | `AUTH_URL` doesn't exactly match the deployed origin. |
| Google error `redirect_uri_mismatch` | The redirect URI in Google Console must be exactly `https://<domain>/api/auth/callback/google`. |
| `@nyu.edu` user can't sign in | Consent screen in Testing mode and the user isn't on the test-user list. |
| Local `db:seed`/`db:push` throws PGlite `Aborted()` | A dev server holds the single-process PGlite lock — stop it first (`rm -rf .pglite` if wedged). Irrelevant on Neon. |
