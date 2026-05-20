const bcrypt = require('bcrypt');
const db = require('../config/database');

// ---------------------------------------------------------------
// Login rate limiting
// ---------------------------------------------------------------
// Single-admin personal site, so a tiny in-memory store is enough.
// Persistence across restarts isn't worth a dependency here.
//
//   Map<ip, { fails: number, lockedUntil: number }>
//
// After MAX_FAILS consecutive failures, the IP is locked for
// LOCKOUT_MS milliseconds. A successful login clears the entry.
const loginAttempts = new Map();
const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
// Hardcoded for a single-author site; matches setup-database.js
const ADMIN_USERNAME = 'admin';

function getClientIp(req) {
  // req.ip honours app.set('trust proxy', ...). We don't set that
  // yet, so this falls back to the direct socket address — fine
  // for local dev. When deploying behind a reverse proxy, set
  // 'trust proxy' in server.js so this returns the real client IP.
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function isLockedOut(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return Math.ceil((entry.lockedUntil - Date.now()) / 1000 / 60);
  }
  // Lockout has expired — clean up so the counter starts fresh.
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    loginAttempts.delete(ip);
  }
  return false;
}

function recordFailure(ip) {
  const entry = loginAttempts.get(ip) || { fails: 0, lockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_FAILS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(ip, entry);
}

function recordSuccess(ip) {
  loginAttempts.delete(ip);
}

// ---------------------------------------------------------------
// Controller actions
// ---------------------------------------------------------------

const adminController = {
  /**
   * GET /admin/login
   * Show the login form. If already logged in, redirectIfAuth
   * middleware will have sent the user to the dashboard.
   */
  showLogin: (req, res) => {
    res.render('admin/login', {
      title: 'Admin Login',
      error: null,
    });
  },

  /**
   * POST /admin/login
   * Validate password against the bcrypt hash stored in the
   * admin table by setup-database.js.
   */
  handleLogin: async (req, res, next) => {
    try {
      const ip = getClientIp(req);
      const lockedMinutes = isLockedOut(ip);
      if (lockedMinutes) {
        return res.status(429).render('admin/login', {
          title: 'Admin Login',
          error: `Too many failed attempts. Try again in ${lockedMinutes} minute(s).`,
        });
      }

      const password = (req.body && req.body.password) || '';
      if (!password) {
        // Don't count empty submissions against the rate limit —
        // they're more likely a user mistake than an attack.
        return res.status(400).render('admin/login', {
          title: 'Admin Login',
          error: 'Password is required.',
        });
      }

      const admin = await db.getAsync(
        'SELECT id, password_hash FROM admin WHERE username = ?',
        [ADMIN_USERNAME]
      );

      // If setup hasn't been run, fail closed with a generic message.
      // The detailed reason goes to server logs, not the response,
      // so we don't leak system state to a probing attacker.
      if (!admin) {
        console.error(
          '[Auth] No admin user found. Run `npm run setup` first.'
        );
        recordFailure(ip);
        return res.status(401).render('admin/login', {
          title: 'Admin Login',
          error: 'Invalid password.',
        });
      }

      const ok = await bcrypt.compare(password, admin.password_hash);
      if (!ok) {
        recordFailure(ip);
        return res.status(401).render('admin/login', {
          title: 'Admin Login',
          error: 'Invalid password.',
        });
      }

      recordSuccess(ip);

      // Capture returnTo BEFORE regenerating, because regenerate
      // wipes the session contents (that's the whole point — it
      // defends against session fixation by giving us a new id).
      const returnTo = req.session.returnTo || '/admin/dashboard';

      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.isAdmin = true;
        req.session.adminId = admin.id;

        // Persist before redirecting, otherwise the redirected
        // request can race the session write and arrive unauthed.
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          res.redirect(returnTo);
        });
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/logout
   * Destroy the session and redirect to the homepage.
   * Done as a POST (not GET) so it can't be triggered by
   * an <img> tag, prefetch, or other cross-origin GET.
   */
  handleLogout: (req, res, next) => {
    if (!req.session) return res.redirect('/');
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid'); // express-session default name
      res.redirect('/');
    });
  },

  /**
   * GET /admin/dashboard
   * Placeholder until the real dashboard phase lands.
   * Confirms auth is actually working.
   */
  showDashboard: (req, res) => {
    res.render('admin/dashboard', {
      title: 'Dashboard',
    });
  },
};

module.exports = adminController;
