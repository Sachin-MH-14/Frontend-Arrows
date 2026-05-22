/**
 * Same guest-token logic as vite.config.js — used by Docker/nginx in production.
 */
import http from 'node:http';

const PORT = Number(process.env.SUPERSET_TOKEN_PORT || 3099);
const supersetBaseUrl = (process.env.VITE_SUPERSET_URL || 'http://172.174.201.208:8088').replace(/\/+$/, '');
const sessionCookie = process.env.SUPERSET_SESSION_COOKIE || '';
const defaultEmbedId = process.env.VITE_SUPERSET_EMBED_ID || '';
const defaultResourceId = process.env.VITE_SUPERSET_DASHBOARD_ID || '';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readJsonSafely(response) {
  const raw = await response.text();
  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  );
}

async function resolveDashboardResourceId(dashboardId) {
  if (defaultResourceId) {
    return String(defaultResourceId);
  }

  const normalized = String(dashboardId || '').trim();
  if (!normalized) return '';
  if (!isUuidLike(normalized)) return normalized;

  const authHeaders = { Cookie: `session=${sessionCookie}` };

  try {
    const listRes = await fetch(`${supersetBaseUrl}/api/v1/dashboard/`, {
      headers: authHeaders,
    });
    const listBody = await readJsonSafely(listRes);
    if (listRes.ok && Array.isArray(listBody.json?.result)) {
      const match = listBody.json.result.find(
        (row) => String(row?.uuid || '').toLowerCase() === normalized.toLowerCase(),
      );
      if (match?.id != null) {
        return String(match.id);
      }
    }
  } catch {
    // fall through
  }

  const candidateUrls = [
    `${supersetBaseUrl}/api/v1/dashboard/${normalized}`,
    `${supersetBaseUrl}/api/v1/dashboard/${normalized}/embedded`,
  ];

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        headers: { Cookie: `session=${sessionCookie}` },
      });
      const payload = await readJsonSafely(response);
      if (!response.ok || !payload.json) continue;

      const result = payload.json.result || payload.json;
      const resolvedId = result?.id || result?.dashboard_id || result?.dashboardId || '';
      if (resolvedId) return String(resolvedId);
    } catch {
      // try next
    }
  }

  return '';
}

const embeddedUser = {
  username: 'embed_user',
  firstName: 'Embed',
  lastName: 'User',
  userId: 0,
  isActive: true,
  isAnonymous: false,
  email: '',
  loginCount: 0,
  createdOn: new Date().toISOString(),
  permissions: {},
  roles: {},
  groups: [],
};

async function handleGuestToken(req, res, requestUrl) {
  if (!sessionCookie) {
    sendJson(res, 500, {
      error: 'Missing SUPERSET_SESSION_COOKIE. Add it to .env.prod and rebuild/restart the container.',
    });
    return;
  }

  const dashboardId = requestUrl.searchParams.get('embedId') || defaultEmbedId;
  const requestedResourceId = requestUrl.searchParams.get('resourceId') || defaultResourceId;

  if (!dashboardId) {
    sendJson(res, 400, {
      error: 'Missing embed id. Provide ?embedId=<uuid> or set VITE_SUPERSET_EMBED_ID.',
    });
    return;
  }

  const resourceId = requestedResourceId || (await resolveDashboardResourceId(dashboardId));

  if (!resourceId) {
    sendJson(res, 400, {
      error: 'Missing resource id. Provide ?resourceId=<id> or set VITE_SUPERSET_DASHBOARD_ID.',
    });
    return;
  }

  try {
    const csrfRes = await fetch(`${supersetBaseUrl}/api/v1/security/csrf_token/`, {
      headers: { Cookie: `session=${sessionCookie}` },
    });
    const csrfBody = await readJsonSafely(csrfRes);

    if (!csrfRes.ok || !csrfBody.json?.result) {
      sendJson(res, csrfRes.status || 500, {
        error: 'Unable to fetch Superset CSRF token.',
        details: csrfBody.json || csrfBody.raw,
      });
      return;
    }

    const guestRes = await fetch(`${supersetBaseUrl}/api/v1/security/guest_token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfBody.json.result,
        Cookie: `session=${sessionCookie}`,
      },
      body: JSON.stringify({
        resources: [{ type: 'dashboard', id: String(resourceId) }],
        rls: [],
        user: {
          username: 'embed_user',
          first_name: 'Embed',
          last_name: 'User',
        },
      }),
    });
    const guestBody = await readJsonSafely(guestRes);

    if (!guestRes.ok || !guestBody.json?.token) {
      sendJson(res, guestRes.status || 500, {
        error: 'Unable to fetch Superset guest token.',
        details: guestBody.json || guestBody.raw,
      });
      return;
    }

    sendJson(res, 200, {
      token: guestBody.json.token,
      dashboardUuid: dashboardId,
      resourceId: String(resourceId),
      // Client resolves to window.location.origin; hint only
      supersetDomain: process.env.VITE_SUPERSET_URL || supersetBaseUrl,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'Unexpected error while generating Superset guest token.',
      details: error?.message || String(error),
    });
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const path = requestUrl.pathname;

  if (req.method === 'GET' && path === '/internal/superset/guest-token') {
    await handleGuestToken(req, res, requestUrl);
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/me/roles/') {
    sendJson(res, 200, { result: embeddedUser });
    return;
  }

  if (req.method === 'GET' && path === '/static/service-worker.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
    });
    res.end(
      [
        "self.addEventListener('install', (event) => { self.skipWaiting(); });",
        "self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });",
        "self.addEventListener('fetch', () => {});",
      ].join('\n'),
    );
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[superset-token] listening on 127.0.0.1:${PORT}`);
});
