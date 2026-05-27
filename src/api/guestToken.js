import API from './axiosConfig';
import { resolveEmbedSupersetDomain } from '../utils/embedSupersetDomain';

/** Arrows_back: GET /api/superset-token (see Arrows_back/routes/supersetRoutes.js) */
const SUPERSET_TOKEN_PATH = 'api/superset-token';
const INTERNAL_DEV_TOKEN_PATH = '/internal/superset/guest-token';

function isLikelyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return false;
  }

  return parts.every((part) => part.length > 0);
}

function normalizeGuestTokenPayload(data = {}) {
  const token = data.token || data.guest_token || '';
  if (!isLikelyJwt(token)) {
    return null;
  }

  return {
    token,
    dashboardUuid:
      data.dashboardUuid ||
      data.dashboard_uuid ||
      import.meta.env.VITE_SUPERSET_EMBED_ID ||
      '',
    supersetDomain: resolveEmbedSupersetDomain(
      data.supersetDomain ||
        data.superset_domain ||
        import.meta.env.VITE_SUPERSET_URL ||
        '',
    ),
    raw: data,
  };
}

function guestTokenFromEnv() {
  const token = import.meta.env.VITE_SUPERSET_GUEST_TOKEN || '';
  if (!token) {
    return null;
  }
  if (!isLikelyJwt(token)) {
    console.warn(
      '[superset] Ignoring VITE_SUPERSET_GUEST_TOKEN because it is not a valid JWT. Provide a real guest token, not a session cookie.',
    );
    return null;
  }
  const hint =
    import.meta.env.VITE_SUPERSET_EMBED_ORIGIN ||
    import.meta.env.VITE_SUPERSET_URL ||
    '';
  return {
    token,
    dashboardUuid: import.meta.env.VITE_SUPERSET_EMBED_ID || '',
    supersetDomain: resolveEmbedSupersetDomain(String(hint).replace(/\/+$/, '')),
    raw: { source: 'VITE_SUPERSET_GUEST_TOKEN' },
  };
}

async function fetchViaInternalDevEndpoint(dashboardUuid = '') {
  const query = new URLSearchParams();
  if (dashboardUuid) {
    query.set('embedId', dashboardUuid);
  }
  const endpoint = query.toString()
    ? `${INTERNAL_DEV_TOKEN_PATH}?${query.toString()}`
    : INTERNAL_DEV_TOKEN_PATH;

  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detailMsg =
      data?.details?.message ||
      (typeof data?.details === 'string' ? data.details : '') ||
      data?.hint ||
      '';
    throw new Error(
      [data?.error || data?.message || `Internal guest-token failed (${response.status})`, detailMsg]
        .filter(Boolean)
        .join(' — '),
    );
  }

  const normalized = normalizeGuestTokenPayload(data);
  if (!normalized) {
    throw new Error('Internal guest-token endpoint returned an invalid token.');
  }

  return normalized;
}

async function fetchViaArrowsBack(dashboardUuid = '') {
  const params = dashboardUuid ? { embedId: dashboardUuid } : undefined;
  const proxyResponse = await API.get(SUPERSET_TOKEN_PATH, {
    params,
    skipAuth: true,
    skipAuthRedirect: true,
  });
  if (!proxyResponse?.data) {
    throw new Error('Guest token response was empty');
  }

  const normalized = normalizeGuestTokenPayload(proxyResponse.data);
  if (!normalized) {
    throw new Error('Arrows_back returned a non-JSON or invalid guest token response.');
  }

  return normalized;
}

export const fetchDashboardGuestToken = async (dashboardUuid = '') => {
  // Same order as npm run dev: internal endpoint (Vite/Docker) then Arrows_back.
  try {
    return await fetchViaInternalDevEndpoint(dashboardUuid);
  } catch (internalError) {
    if (import.meta.env.DEV) {
      console.warn(
        '[superset] /internal/superset/guest-token failed, trying Arrows_back:',
        internalError?.message || internalError,
      );
    }
  }

  try {
    return await fetchViaArrowsBack(dashboardUuid);
  } catch (proxyError) {
    const fromEnv = guestTokenFromEnv();
    if (fromEnv?.token) {
      console.warn(
        '[superset] Using VITE_SUPERSET_GUEST_TOKEN because token endpoints failed. Static guest JWTs expire.',
      );
      return fromEnv;
    }

    const errorMessage =
      proxyError?.response?.data?.error ||
      proxyError?.response?.data?.message ||
      proxyError?.message ||
      'Failed to fetch guest token. Check SUPERSET_SESSION_COOKIE in .env.prod and rebuild Docker.';
    throw new Error(errorMessage);
  }
};
