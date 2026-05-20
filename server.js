require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------
// Fail loudly in production if SESSION_SECRET is missing.
// In development a fallback is fine; in production a known-weak
// secret would let an attacker forge session cookies.
// ------------------------------------
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error(
    '[Fatal] SESSION_SECRET must be set when NODE_ENV=production.'
  );
  process.exit(1);
}

// ------------------------------------
// View engine setup
// ------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ------------------------------------
// Middleware
// ------------------------------------

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Parse incoming form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(
  session({
    name: 'connect.sid', // explicit default; keep stable for logout's clearCookie
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Tie cookie-secure to NODE_ENV so dev (http) works and
      // production (https) gets a Secure-flag cookie automatically.
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax', // baseline CSRF defence for POSTs
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// ------------------------------------
// Make session data available to all views
// ------------------------------------
app.use((req, res, next) => {
  res.locals.isAdmin = req.session.isAdmin || false;
  next();
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
