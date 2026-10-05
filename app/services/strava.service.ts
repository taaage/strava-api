import { STRAVA_API_BASE, STRAVA_OAUTH_URL } from "../config/constants";
import { withAdvisoryTransactionLock } from "./db.service";

type CachedStravaTokens = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  configuredRefreshToken: string;
};

const STRAVA_AUTH_CACHE_KEY = "strava-auth";
const STRAVA_AUTH_LOCK_ID = 87125031;

export async function refreshAccessToken(): Promise<string | null> {
  return withAdvisoryTransactionLock(
    STRAVA_AUTH_LOCK_ID,
    async (client) => {
      const configuredRefreshToken = process.env.STRAVA_REFRESH_TOKEN;
      const { rows } = await client.query<{ value: CachedStravaTokens }>(
        "SELECT value FROM kv_cache WHERE key = $1",
        [STRAVA_AUTH_CACHE_KEY],
      );
      const cached = rows[0]?.value;
      const configuredTokenChanged =
        !!configuredRefreshToken &&
        cached?.configuredRefreshToken !== configuredRefreshToken;

      if (
        !configuredTokenChanged &&
        cached?.accessToken &&
        cached.expiresAt > Date.now() / 1000 + 60
      ) {
        return cached.accessToken;
      }

      const refreshToken = configuredTokenChanged
        ? configuredRefreshToken
        : (cached?.refreshToken ?? configuredRefreshToken);
      if (!refreshToken) return null;

      const response = await fetch(STRAVA_OAUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error(
          `[STRAVA AUTH] Token refresh failed (${response.status}): ${data.message ?? "No error message"}`,
        );
        return null;
      }

      if (!data.access_token || !data.refresh_token || !data.expires_at) {
        console.error("[STRAVA AUTH] Token refresh response was missing tokens");
        return null;
      }

      const tokenState: CachedStravaTokens = {
        accessToken: data.access_token,
        expiresAt: data.expires_at,
        refreshToken: data.refresh_token,
        configuredRefreshToken: configuredRefreshToken ?? refreshToken,
      };
      await client.query(
        `INSERT INTO kv_cache (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [STRAVA_AUTH_CACHE_KEY, JSON.stringify(tokenState)],
      );

      return tokenState.accessToken;
    },
  );
}

export async function getActivity(activityId: number, token: string) {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}

export async function updateActivityDescription(
  activityId: number,
  token: string,
  description: string
): Promise<void> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ description }),
  });

  if (!response.ok) {
    console.error(
      `[STRAVA] Description update failed for activity ${activityId} (${response.status})`,
    );
  }
}

export async function markActivityAsCommute(
  activityId: number,
  token: string,
  gearId: string,
): Promise<void> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Commute", commute: true, gear_id: gearId }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to mark Strava activity ${activityId} as commute (${response.status})`,
    );
  }
}
