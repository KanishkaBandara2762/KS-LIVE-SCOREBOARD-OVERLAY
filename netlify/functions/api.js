/**
 * Netlify Function — the entire Express API.
 *
 * Netlify redirects `/api/*` to this function (see netlify.toml). The function
 * is HTTP-only: there is no Socket.IO and no background timer. Auction timers
 * are settled lazily by the API (see auctionEngine.settleExpiredLot), and the
 * React client polls the REST snapshot when VITE_REALTIME_MODE=polling.
 */

const serverless = require('serverless-http');
const { buildApp } = require('../../backend/app');
const { ensureDBConnection } = require('../../backend/config/db');

const app = buildApp();
const httpHandler = serverless(app, {
  // Netlify base64-encodes binary request bodies. serverless-http decodes them
  // back to Buffers so multipart uploads keep working.
  binary: ['image/*', 'application/octet-stream', 'multipart/form-data'],
});

const FUNCTION_PREFIX = '/.netlify/functions/api';

/**
 * Netlify invokes this function with `/.netlify/functions/api/<rest>`.
 * Express routes expect `/api/<rest>`, so add the `/api` prefix back.
 */
function toExpressPath(rawPath) {
  const path = rawPath || '/';
  if (path === FUNCTION_PREFIX) return '/api';
  if (path.startsWith(`${FUNCTION_PREFIX}/`)) {
    return `/api${path.slice(FUNCTION_PREFIX.length)}`;
  }
  return path;
}

/**
 * Always delegate to ensureDBConnection(): it returns immediately when this
 * container is still connected, and transparently reconnects when a frozen
 * function instance wakes up with a dead socket. Caching a resolved promise
 * here would keep a stale connection forever.
 */
function connect() {
  return ensureDBConnection();
}

exports.handler = async (event, context) => {
  // Reuse the cached Mongoose connection between warm invocations.
  context.callbackWaitsForEmptyEventLoop = false;

  event.path = toExpressPath(event.path);
  if (event.rawPath) event.rawPath = event.path;
  if (event.rawUrl) {
    try {
      const url = new URL(event.rawUrl);
      url.pathname = event.path;
      event.rawUrl = url.toString();
    } catch (_) {
      /* ignore malformed rawUrl */
    }
  }

  const isHealthCheck = event.path === '/api/health' || event.path === '/api/health/ready';

  try {
    await connect();
  } catch (err) {
    console.error('[NETLIFY API] database unavailable:', err.message);
    if (!isHealthCheck) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Database unavailable. Check MONGODB_URI and the Atlas network access list.',
          code: 'DB_UNAVAILABLE',
        }),
      };
    }
  }

  return httpHandler(event, context);
};
