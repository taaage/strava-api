import { STRAVA_API_BASE, STRAVA_OAUTH_URL } from "../config/constants";

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
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
  return data.access_token;
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
  await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ description }),
  });
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
