import { STRAVA_OAUTH_URL } from "@/app/config/constants";
import { withAdvisoryTransactionLock } from "@/app/services/db.service";

type StoredRefreshToken = {
  refreshToken: string;
  configuredToken: string;
};

const REFRESH_TOKEN_CACHE_KEY = "strava-refresh-token";
const REFRESH_TOKEN_LOCK_ID = 87125031;

export async function refreshAccessToken(): Promise<string | null> {
  return withAdvisoryTransactionLock(REFRESH_TOKEN_LOCK_ID, async (client) => {
    const configuredToken = process.env.STRAVA_REFRESH_TOKEN;
    const { rows } = await client.query<{ value: StoredRefreshToken }>(
      "SELECT value FROM kv_cache WHERE key = $1",
      [REFRESH_TOKEN_CACHE_KEY],
    );
    const stored = rows[0]?.value;
    const configuredTokenChanged =
      !!configuredToken && stored?.configuredToken !== configuredToken;
    const refreshToken = configuredTokenChanged
      ? configuredToken
      : (stored?.refreshToken ?? configuredToken);

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

    if (!data.access_token || !data.refresh_token) {
      console.error("[STRAVA AUTH] Token refresh response was missing tokens");
      return null;
    }

    const nextStored: StoredRefreshToken = {
      refreshToken: data.refresh_token,
      configuredToken: configuredToken ?? refreshToken,
    };
    await client.query(
      `INSERT INTO kv_cache (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [REFRESH_TOKEN_CACHE_KEY, JSON.stringify(nextStored)],
    );

    return data.access_token;
  });
}