# Writer Site

A personal book publishing site for writers. Browse books, read
chapters, and manage everything through a password-protected admin
panel.

## Tech stack

- **Node.js** + **Express** — backend
- **EJS** — server-side templates
- **SQLite** — database (single file, zero config)
- **sharp** + **multer** — cover image upload & processing
- **bcrypt** + **express-session** — admin authentication
- No client-side framework — server-rendered HTML, minimal JS

## Local development

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env
# Edit .env: set ADMIN_PASSWORD and SESSION_SECRET (any non-empty
# values are fine for dev)

# Initialise the database (creates tables, hashes admin password)
npm run setup

# Optionally seed two sample books with three chapters each
npm run setup:seed

# Start the dev server with auto-reload
npm run dev
```

Visit:
- <http://localhost:3000/> — public site (book library)
- <http://localhost:3000/admin/login> — admin panel

## Deployment

See [DEPLOY.md](./DEPLOY.md) for a step-by-step Railway deployment
walk-through. The same architecture works on Render, Fly.io, or any
VPS that runs Node.

## Project structure

```
config/        SQLite connection
controllers/   Route handlers (book, chapter, admin)
middleware/    Auth, file upload, flash messages
public/        Static assets + uploaded covers (dev only)
routes/        Express route definitions
views/         EJS templates
  admin/         Admin UI
  partials/      Shared header/footer/flash
patches/       Per-phase git patches (development history)
setup-database.js  Idempotent DB initialisation
server.js          Application entry point
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with nodemon auto-reload |
| `npm start` | Start production server |
| `npm run setup` | Create tables + admin user (idempotent) |
| `npm run setup:seed` | Same as setup + adds sample books |
| `npm run deploy:setup` | Alias for `setup`, used by Railway start command |
