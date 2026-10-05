import { STRAVA_API_BASE } from "../config/constants";

export async function getActivity(activityId: number, token: string) {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
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
    body: JSON.stringify({ commute: true, gear_id: gearId }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to mark Strava activity ${activityId} as commute (${response.status})`,
    );
  }
}
