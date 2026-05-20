require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ------------------------------------
// Fail loudly in production if required secrets are missing.
// In development, fallbacks are fine; in production, a known-weak
// secret or missing admin password would be a serious problem.
// ------------------------------------
if (IS_PRODUCTION) {
  const missing = [];
  if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    console.error(
      `[Fatal] These env vars are required in production: ${missing.join(', ')}`
    );
    process.exit(1);
  }
}

// ------------------------------------
// Trust the platform's reverse proxy in production so req.ip
// reflects the real client (needed for the login rate limiter).
// "1" = trust the first hop, which is what Railway / Fly / Heroku
// / Render all sit at. Don't blindly trust X-Forwarded-For from
// arbitrary depths — that lets clients spoof their IP.
// ------------------------------------
if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

// ------------------------------------
// View engine setup
// ------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ------------------------------------
// Middleware
// ------------------------------------

// Static assets from /public (CSS, JS).
app.use(express.static(path.join(__dirname, 'public')));

// User-uploaded covers. In production these live on a persistent
// volume outside the project tree (UPLOADS_DIR env var). The public
// URL stays /uploads/<filename> in both environments so templates
// don't need to know about it.
const { UPLOADS_DIR } = require('./middleware/upload');
app.use('/uploads', express.static(UPLOADS_DIR));

// Parse incoming form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ------------------------------------
// Session store
// ------------------------------------
// In development: default in-memory store (sessions lost on restart, fine).
// In production: SQLite-backed store so sessions survive redeploys.
//
// The session DB lives next to the main app DB by default. On Railway
// with a persistent volume mounted at /data, point both at /data:
//   DATABASE_PATH=/data/database.db
//   SESSIONS_DIR=/data
// (SESSIONS_DIR defaults to the directory containing DATABASE_PATH,
//  falling back to the project root in dev.)
const sessionConfig = {
  name: 'connect.sid', // explicit default; keep stable for logout's clearCookie
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Tie cookie-secure to NODE_ENV so dev (http) works and
    // production (https) gets a Secure-flag cookie automatically.
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'lax', // baseline CSRF defence for POSTs
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  },
};

if (IS_PRODUCTION) {
  const SQLiteStore = require('connect-sqlite3')(session);
  // Default sessions.db location: same dir as DATABASE_PATH, or project root
  const sessionsDir = process.env.SESSIONS_DIR
    || (process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : __dirname);
  sessionConfig.store = new SQLiteStore({
    db: 'sessions.db',
    dir: sessionsDir,
    // Periodically purge expired sessions (1h interval)
    concurrentDB: true,
  });
  console.log(`[Session] SQLite store at ${path.join(sessionsDir, 'sessions.db')}`);
}

app.use(session(sessionConfig));

// ------------------------------------
// Flash messages (one-shot, session-backed)
// ------------------------------------
const flash = require('./middleware/flash');
app.use(flash);

// ------------------------------------
// Make session data available to all views
// ------------------------------------
app.use((req, res, next) => {
  res.locals.isAdmin = req.session.isAdmin || false;
  next();
});

// ------------------------------------
// Health check — Railway (and most platforms) ping this to
// verify the service is alive. Cheap, no DB hit, no session.
// ------------------------------------
app.get('/healthz', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

// ------------------------------------
// Routes
// ------------------------------------
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// ------------------------------------
// 404 Handler
// ------------------------------------
app.use((req, res) => {
  res.status(404).send('404 - Page not found');
});

// ------------------------------------
// Global error handler
// ------------------------------------
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(500).send('Something went wrong. Please try again later.');
});

// ------------------------------------
// Start server
// ------------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
