/**
 * Resolve the on-disk upload directory.
 *
 * Netlify Functions run on a read-only filesystem except for the OS temp
 * directory, so creating `backend/uploads` at import time crashes the function.
 * In serverless the directory falls back to the OS temp folder (ephemeral —
 * use external URLs for images that must persist).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const isServerless = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
);

const baseDir = isServerless
  ? path.join(os.tmpdir(), 'ks-live-uploads')
  : path.join(__dirname, '..', 'uploads');

function resolveUploadDir(subdir = '') {
  const dir = subdir ? path.join(baseDir, subdir) : baseDir;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    // Read-only filesystem — callers still get a path, storage is best-effort.
  }
  return dir;
}

module.exports = { baseDir, resolveUploadDir, isServerless };
