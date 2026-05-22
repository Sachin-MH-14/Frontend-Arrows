import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import process from 'node:process'

const DEFAULT_SUPERSET_URL = 'http://172.174.201.208:8088';

function trimTrailingSlash(url) {
  return (url || '').replace(/\/+$/, '');
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
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

function attachSessionCookieIfMissing(proxy, sessionCookie) {
  if (!sessionCookie) {
    return;
  }

  proxy.on('proxyReq', (proxyReq) => {
    const existingCookieHeader = proxyReq.getHeader('cookie');
    if (!existingCookieHeader) {
      proxyReq.setHeader('cookie', `session=${sessionCookie}`);
    }
  });
}

function supersetGuestTokenPlugin(env) {
  const supersetBaseUrl = trimTrailingSlash(env.VITE_SUPERSET_URL || DEFAULT_SUPERSET_URL);
  const sessionCookie = env.SUPERSET_SESSION_COOKIE || '';
  const defaultEmbedId = env.VITE_SUPERSET_EMBED_ID || '';
  const defaultResourceId = env.VITE_SUPERSET_DASHBOARD_ID || '';

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
        const response = await fetch(url, { headers: authHeaders });
        const payload = await readJsonSafely(response);
        if (!response.ok || !payload.json) {
          continue;
        }

        const result = payload.json.result || payload.json;
        const resolvedId =
          result?.id || result?.dashboard_id || result?.dashboardId || '';

        if (resolvedId) {
          return String(resolvedId);
        }
      } catch {
        // Continue to next lookup strategy.
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

  function sendEmbeddedUser(res) {
    sendJson(res, 200, { result: embeddedUser });
  }

  return {
    name: 'superset-guest-token-dev-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/static/service-worker.js', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          [
            "self.addEventListener('install', (event) => { self.skipWaiting(); });",
            "self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });",
            "self.addEventListener('fetch', () => {});",
          ].join('\n'),
        );
      });

      server.middlewares.use('/api/v1/me/roles/', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
          return;
        }

        sendEmbeddedUser(res);
      });

      server.middlewares.use('/internal/superset/guest-token', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
          return;
        }

        if (!sessionCookie) {
          sendJson(res, 500, {
            error: 'Missing SUPERSET_SESSION_COOKIE in environment. Add it to .env.dev and restart Vite.',
          });
          return;
        }

        const requestUrl = new URL(req.url || '', 'http://localhost');
        const dashboardId = requestUrl.searchParams.get('embedId') || defaultEmbedId;
        const requestedResourceId =
          requestUrl.searchParams.get('resourceId') || defaultResourceId;

        if (!dashboardId) {
          sendJson(res, 400, {
            error: 'Missing embed id. Provide ?embedId=<uuid> or set VITE_SUPERSET_EMBED_ID.',
          });
          return;
        }

        const resourceId =
          requestedResourceId || (await resolveDashboardResourceId(dashboardId));

        if (!resourceId) {
          sendJson(res, 400, {
            error: 'Missing resource id. Provide ?resourceId=<id> or set VITE_SUPERSET_DASHBOARD_ID.',
          });
          return;
        }

        try {
          const csrfRes = await fetch(`${supersetBaseUrl}/api/v1/security/csrf_token/`, {
            headers: {
              Cookie: `session=${sessionCookie}`,
            },
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
            const details = guestBody.json || guestBody.raw;
            const hint =
              details?.message === 'EmbeddedDashboard not found.'
                ? 'Wrong embed/dashboard id. Set VITE_SUPERSET_DASHBOARD_ID to the numeric dashboard id (e.g. 10 for Recruiter Dashboard) and update VITE_SUPERSET_EMBED_ID from Superset → Embed dashboard.'
                : undefined;
            sendJson(res, guestRes.status || 500, {
              error: 'Unable to fetch Superset guest token.',
              hint,
              details,
            });
            return;
          }

          sendJson(res, 200, {
            token: guestBody.json.token,
            dashboardUuid: dashboardId,
            resourceId: String(resourceId),
            supersetDomain: env.VITE_SUPERSET_URL || supersetBaseUrl,
          });
        } catch (error) {
          sendJson(res, 500, {
            error: 'Unexpected error while generating Superset guest token.',
            details: error?.message || String(error),
          });
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supersetSessionCookie = env.SUPERSET_SESSION_COOKIE || '';

  return {
    plugins: [react(), supersetGuestTokenPlugin(env)],
    css: {
      modules: {
        // Keep class names human-readable in DOM: JobOpenings__page
        generateScopedName: '[name]__[local]',
      },
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.VITE_PORT || 5173),
      strictPort: true,
      proxy: {
        '/api/v1': {
          target: env.VITE_SUPERSET_URL || DEFAULT_SUPERSET_URL,
          changeOrigin: true,
          autoRewrite: true,
          hostRewrite: 'localhost:5173',
          protocolRewrite: 'http',
            configure: (proxy) => attachSessionCookieIfMissing(proxy, supersetSessionCookie),
        },
        '/static': {
          target: env.VITE_SUPERSET_URL || DEFAULT_SUPERSET_URL,
          changeOrigin: true,
          autoRewrite: true,
          hostRewrite: 'localhost:5173',
          protocolRewrite: 'http',
            configure: (proxy) => attachSessionCookieIfMissing(proxy, supersetSessionCookie),
        },
        '/superset': {
          target: env.VITE_SUPERSET_URL || DEFAULT_SUPERSET_URL,
          changeOrigin: true,
          autoRewrite: true,
          hostRewrite: 'localhost:5173',
          protocolRewrite: 'http',
            configure: (proxy) => attachSessionCookieIfMissing(proxy, supersetSessionCookie),
        },
        // Guest JWT only — do not send admin session cookie on /embedded
        '/embedded': {
          target: env.VITE_SUPERSET_URL || DEFAULT_SUPERSET_URL,
          changeOrigin: true,
          autoRewrite: true,
          hostRewrite: 'localhost:5173',
          protocolRewrite: 'http',
        },
        '/login': {
          target: env.VITE_SUPERSET_URL || DEFAULT_SUPERSET_URL,
          changeOrigin: true,
          autoRewrite: true,
          hostRewrite: 'localhost:5173',
          protocolRewrite: 'http',
            configure: (proxy) => attachSessionCookieIfMissing(proxy, supersetSessionCookie),
        },
        // Keep this last so /api/v1 continues to proxy to Superset.
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      strictPort: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'mui-vendor': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'chart-vendor': ['recharts'],
            'utils': ['axios'],
          }
        }
      },
      chunkSizeWarningLimit: 1000,
      minify: 'esbuild',
      sourcemap: false,
    },
  };
});
