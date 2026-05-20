/**
 * Tiny session-backed flash messages.
 * ---------------------------------------------------------------
 * Avoids pulling in `connect-flash` (which is unmaintained anyway).
 *
 * Use:
 *   req.flash('success', 'Book created.');
 *   req.flash('error',   'Something went wrong.');
 *
 * In views:
 *   <% if (flash.success) { %> ... <%= flash.success %> ... <% } %>
 *   <% if (flash.error)   { %> ... <%= flash.error %>   ... <% } %>
 *
 * Messages are consumed (cleared) on the next response, so a
 * redirect-then-render pattern shows the message exactly once.
 */
function flashMiddleware(req, res, next) {
  if (!req.session) {
    // Defensive: if sessions aren't enabled, treat flash as a no-op.
    req.flash = () => {};
    res.locals.flash = {};
    return next();
  }

  // Initialise storage on first use per session.
  if (!req.session._flash) {
    req.session._flash = {};
  }

  // Setter: write into session for the NEXT request.
  req.flash = (type, message) => {
    if (!type || !message) return;
    req.session._flash[type] = String(message);
  };

  // Make CURRENT messages available to templates, then clear them.
  res.locals.flash = req.session._flash || {};
  req.session._flash = {};

  next();
}

module.exports = flashMiddleware;
