import * as React from "react";
import { embedDashboard } from "@superset-ui/embedded-sdk";
import styles from "./Dashboard.module.scss";
import { fetchDashboardGuestToken } from "../../api/guestToken";
import { resolveEmbedSupersetDomain } from "../../utils/embedSupersetDomain";
import { DASHBOARD_UUID_MAP } from "../../utils/constants";

const FALLBACK_SUPERSET_URL =
  import.meta.env.VITE_SUPERSET_URL || "http://172.174.201.208:8088";

const FALLBACK_EMBED_UUID =
  import.meta.env.VITE_SUPERSET_EMBED_ID || DASHBOARD_UUID_MAP.default;

export default function Dashboard() {
  const mountRef = React.useRef(null);
  const [embedError, setEmbedError] = React.useState("");

  React.useEffect(() => {
    let isDisposed = false;
    const mountPoint = mountRef.current;

    if (!mountPoint) {
      return;
    }

    const initializeEmbedding = async () => {
      try {
        setEmbedError("");
        mountPoint.innerHTML = "";

        const rawRole = String(localStorage.getItem("userRole") || "").trim().toLowerCase();
        const normalizedRole = rawRole.replace(/[_\s-]+/g, "");
        const roleDashboardUuid =
          DASHBOARD_UUID_MAP[rawRole] ||
          DASHBOARD_UUID_MAP[normalizedRole] ||
          "";

        const bootstrap = await fetchDashboardGuestToken(roleDashboardUuid);
        const dashboardId =
          roleDashboardUuid ||
          bootstrap.dashboardUuid ||
          FALLBACK_EMBED_UUID;
        const supersetDomain = resolveEmbedSupersetDomain(
          bootstrap.supersetDomain || FALLBACK_SUPERSET_URL,
        );

        if (!dashboardId) {
          throw new Error(
            "Backend did not return dashboardUuid. Set SUPERSET_DASHBOARD_UUID in Arrows_back/.env.",
          );
        }

        const getGuestToken = async () => {
          const { token } = await fetchDashboardGuestToken(dashboardId);

          if (!token) {
            throw new Error("Unable to generate Superset guest token.");
          }

          return token;
        };

        await embedDashboard({
          id: dashboardId,
          supersetDomain,
          mountPoint,
          fetchGuestToken: getGuestToken,
          referrerPolicy: "strict-origin-when-cross-origin",
          debug:
            import.meta.env.DEV ||
            import.meta.env.VITE_SUPERSET_EMBED_DEBUG === "true",
          dashboardUiConfig: {
            hideTitle: true,
            filters: { expanded: true },
          },
        });
      } catch (error) {
        if (!isDisposed) {
          setEmbedError(error?.message || "Failed to load Superset dashboard.");
          console.error("Failed to load embedded Superset dashboard", error);
        }
      }
    };

    initializeEmbedding();

    return () => {
      isDisposed = true;
      if (mountPoint) {
        mountPoint.innerHTML = "";
      }
    };
  }, []);

  return (
    <div className={styles.fullViewWrap}>
      <div className={styles.embedFull}>
        {embedError ? (
          <div style={{ padding: 16, color: "#b91c1c" }}>
            {embedError}
          </div>
        ) : null}
        <div ref={mountRef} style={{ width: "100%", height: "100vh" }} />
      </div>
    </div>
  );
}
