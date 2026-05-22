const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(hostname);
}

/** Vite dev/preview/Docker ports where /embedded is proxied to Superset. */
const LOCAL_EMBED_PROXY_PORTS = new Set(["5173", "4173", "8080"]);

/**
 * Resolves the origin passed to @superset-ui/embedded-sdk as `supersetDomain`.
 * postMessage(..., targetOrigin) must equal the iframe document origin exactly.
 *
 * With Vite or nginx, /embedded is proxied on the same host as the React app, so the
 * iframe MUST use window.location.origin — not a hardcoded IP from .env.
 */
export function resolveEmbedSupersetDomain(apiDomain) {
  if (typeof window !== "undefined") {
    const pageOrigin = window.location.origin.replace(/\/+$/, "");

    if (import.meta.env.VITE_SUPERSET_EMBED_SAME_ORIGIN === "true") {
      return pageOrigin;
    }

    const explicit = String(import.meta.env.VITE_SUPERSET_EMBED_ORIGIN || "")
      .trim()
      .replace(/\/+$/, "");

    // If .env points at another host than where the user opened the app, prefer the page origin.
    if (explicit) {
      try {
        const configured = new URL(explicit);
        const page = new URL(pageOrigin);
        if (
          configured.protocol === page.protocol &&
          configured.hostname === page.hostname &&
          configured.port === page.port
        ) {
          return explicit;
        }
      } catch {
        // ignore invalid explicit URL
      }
    }

    return pageOrigin;
  }

  const explicit = String(import.meta.env.VITE_SUPERSET_EMBED_ORIGIN || "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const normalized = String(apiDomain || "").replace(/\/+$/, "");
  if (!normalized) {
    return normalized;
  }

  try {
    const u = new URL(normalized);

    if (
      import.meta.env.DEV &&
      isLoopbackHost(u.hostname) &&
      u.protocol === "http:"
    ) {
      const apiPort = u.port || "80";
      if (LOCAL_EMBED_PROXY_PORTS.has(apiPort)) {
        return normalized;
      }
    }
  } catch {
    // fall through
  }

  return normalized;
}
