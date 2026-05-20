/**
 * Cover image upload middleware.
 * ---------------------------------------------------------------
 * Uses multer for the multipart parsing, holds the file in memory
 * (NOT on disk), then sharp resizes/re-encodes it to WebP and
 * writes a final file with a crypto-random name.
 *
 * Why memory storage? Two reasons:
 *   1) We never want to keep the raw upload around — only the
 *      processed WebP. Memory storage means no temp file to clean.
 *   2) sharp() can read straight from a Buffer; no I/O round-trip.
 *
 * Why crypto-random filenames? Three reasons:
 *   1) No collisions (two users uploading "cover.jpg").
 *   2) No path-traversal risk from user-controlled names.
 *   3) Doesn't leak the user's original filename.
 *
 * Exported:
 *   - uploadCover:     multer middleware (parses one `cover` field)
 *   - processCover:    async function that takes req.file and writes
 *                      a WebP to public/uploads/, returns the filename.
 *   - deleteCover:     async helper to remove an old file by filename.
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// Reject by both MIME type and (later) by sharp's own probing.
// MIME alone is trivially spoofed; sharp will throw on actual junk.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const storage = multer.memoryStorage();

const uploadCover = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      // Attach a friendly message; the controller will surface it.
      const err = new Error('Cover must be JPG, PNG, or WebP.');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
}).single('cover');

/**
 * Take the in-memory file from multer, resize + re-encode to WebP,
 * write to disk with a random name, return the bare filename.
 *
 * Resize policy: fit within 800x1200, never enlarge, preserve
 * aspect ratio. WebP quality 82 is a good middle ground.
 */
async function processCover(file) {
  if (!file || !file.buffer) return null;

  // Ensure uploads dir exists (idempotent).
  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const filename = crypto.randomBytes(16).toString('hex') + '.webp';
  const fullPath = path.join(UPLOADS_DIR, filename);

  try {
    await sharp(file.buffer)
      .rotate() // auto-orient using EXIF
      .resize({
        width: 800,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toFile(fullPath);
  } catch (err) {
    // sharp throws on non-image input even if MIME looked ok.
    const wrapped = new Error('Cover image could not be processed.');
    wrapped.code = 'INVALID_FILE_TYPE';
    wrapped.cause = err;
    throw wrapped;
  }

  return filename;
}

/**
 * Best-effort delete of a cover file. Never throws — a missing
 * file when we try to delete isn't an application-level error.
 */
async function deleteCover(filename) {
  if (!filename) return;

  // Defence in depth: refuse anything that looks like a path.
  // The filenames we generate are pure hex+.webp, so anything
  // else is suspicious.
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    console.warn('[uploads] Refusing to delete suspicious filename:', filename);
    return;
  }

  const fullPath = path.join(UPLOADS_DIR, filename);
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[uploads] Failed to delete', filename, '-', err.message);
    }
  }
}

module.exports = {
  uploadCover,
  processCover,
  deleteCover,
  UPLOADS_DIR,
  MAX_BYTES,
};
