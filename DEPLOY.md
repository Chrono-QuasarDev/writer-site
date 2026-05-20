# Deploying Writer Site to Railway

A complete walk-through from "I have a working local dev environment" to
"the site is live on the public internet."

---

## Why Railway?

Railway runs Node apps cheaply, gives you a persistent volume for SQLite
+ uploads, includes free HTTPS, and only takes ~10 minutes to set up.
Free credit ($5/month) generally covers a low-traffic personal site.

If you'd rather use **Render**, **Fly.io**, or a **VPS**, the same
project works there — only the platform-specific steps differ. The
production-readiness code changes (env vars, trust proxy, `/healthz`,
volume-aware paths) are platform-agnostic.

---

## Prerequisites

- The project is checked into a GitHub repo you control.
- You've committed all your local changes (`git status` is clean).
- Local dev still works (`npm run dev` → visit `/admin/login`).

---

## Step 1 — Create a Railway account

1. Go to <https://railway.app>
2. Click **Login** → **Login with GitHub**
3. Authorise Railway to read your repos.

That's it for signup. Free tier gives you $5 of credit per month.

---

## Step 2 — Create the project

1. From the Railway dashboard, click **New Project**
2. Choose **Deploy from GitHub repo**
3. Pick your `writer-site` repo
4. Railway will auto-detect Node + start a first build.

The first build will **probably fail** because env vars and the volume
aren't set up yet. That's expected — we'll fix it in the next two steps.

---

## Step 3 — Add the persistent volume

Without this, every redeploy wipes your database and uploaded covers.

1. In your Railway project, click on your service (the box representing
   the app)
2. Go to the **Settings** tab → scroll to **Volumes**
3. Click **+ New Volume**
4. **Mount path:** `/data`
5. **Size:** 1 GB (the smallest option) is plenty for a personal site
6. Click **Add**

Railway will provision the volume and trigger a redeploy.

---

## Step 4 — Set environment variables

In your service, go to **Variables** tab and add the following:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables secure cookies, trust proxy, env validation |
| `ADMIN_PASSWORD` | (a strong unique password — different from your dev one!) | Used for the admin login |
| `SESSION_SECRET` | (32+ random hex chars; see below) | Signs session cookies |
| `DATABASE_PATH` | `/data/database.db` | Lives on the volume |
| `UPLOADS_DIR` | `/data/uploads` | Lives on the volume |

To generate a strong `SESSION_SECRET`, run locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

To generate a strong `ADMIN_PASSWORD`, you can use a password manager
or:

```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

**Store both somewhere safe — you'll need `ADMIN_PASSWORD` to log in.**

After saving the variables, Railway will redeploy automatically.

---

## Step 5 — Watch the deploy

In your service, the **Deployments** tab shows logs in real time.
A successful deploy looks like this:

```
[Setup] Creating tables...
  ✓ books
  ✓ chapters
  ✓ admin
[Setup] Creating indexes...
  ✓ indexes ready
[Setup] Created admin user "admin".
[Setup] Skipping seed data (pass --seed to include it).

[Setup] ✅ Database is ready.

Server running at http://localhost:8080
Environment: production
[Database] Connected to SQLite at /data/database.db
```

The startup runs `npm run deploy:setup && npm start` (configured in
`railway.json`). The setup script is idempotent — it skips tables and
the admin user on subsequent boots.

---

## Step 6 — Visit the site

1. In your service, **Settings** → **Networking** → **Generate Domain**
2. Railway creates a `*.up.railway.app` URL.
3. Click it. You should see the homepage with the "No books published
   yet" empty state (we didn't seed in production — see optional step
   below if you want sample data).
4. Visit `/admin/login` and use the `ADMIN_PASSWORD` you set.
5. Try creating a book with a cover image. Verify the cover survives
   a redeploy: change a file locally, `git push`, wait for redeploy,
   reload the book page — the cover should still be there. That's
   your volume working.

---

## Optional — Seed sample data in production

Skip this if you want to add real books through the admin UI from the
start. If you want the demo books seeded:

1. Railway service → **Settings** → **Deploy** → temporarily change
   start command to:
   ```
   node setup-database.js --seed && npm start
   ```
2. Trigger a redeploy
3. Once it's up, change the start command back to:
   ```
   npm run deploy:setup && npm start
   ```
4. Seed-script is also idempotent — it skips seeding if any books exist.

---

## Optional — Custom domain

Once you're happy with the deployment on the Railway subdomain:

1. Service → **Settings** → **Networking** → **+ Custom Domain**
2. Enter your domain (e.g. `writing.example.com`)
3. Add the CNAME record Railway gives you at your DNS provider
4. Wait a few minutes — HTTPS is provisioned automatically

---

## Routine operations

### Updating the code
Push to your repo's main branch. Railway auto-deploys.

### Changing the admin password
Update `ADMIN_PASSWORD` in Railway env vars. Then **either**:
- Delete the admin row in the DB and restart (the setup script will
  recreate it with the new password), **or**
- Leave the old row — the new password won't take effect until you
  remove the row, because `setup-database.js` only creates the admin
  user if one doesn't already exist.

A future polish phase could add a proper admin "change password" tool.

### Backing up your data
Railway volumes are durable but not backed up automatically. Periodic
manual backup:

```bash
# From your local machine, with the railway CLI installed
railway ssh
cat /data/database.db > /tmp/db.snapshot   # then download via scp / git
```

Or accept the risk for a personal site. Up to you.

### Reading logs
Service → **Deployments** → click the latest → **Logs** tab.

---

## Troubleshooting

### "Application failed to respond"
Check the deploy logs. Most common causes:
- Missing required env var (the app exits with a clear `[Fatal]` line)
- Volume not mounted at `/data` (uploads middleware will throw on first
  upload attempt)
- Port mismatch — your code reads `process.env.PORT`; Railway sets it
  automatically. Don't hardcode 3000.

### "504 timeout" on first request
Cold start. Railway spins services down after inactivity on the free
tier. First request wakes it; subsequent requests are fast.

### Sessions don't persist
Make sure `SESSION_SECRET` is set in env vars (not just `.env`, which
isn't deployed). Without it in production, the app will refuse to start
(by design).

### Cover images 404 after deploy
The volume isn't mounted. Re-check Step 3. The path on the volume side
must be exactly `/data`, and `UPLOADS_DIR` must be set to
`/data/uploads`.

### Free credit ran out
You'll get an email. Either add a credit card to upgrade, or the
service pauses until the next month. Data on the volume is preserved.
