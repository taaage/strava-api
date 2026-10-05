import { refreshAccessToken } from "@/app/services/strava-auth.service";
import { syncAthlete } from "@/app/services/athlete.sync";
import { syncActivities } from "@/app/services/activities.sync";
import { syncStarredSegments } from "@/app/services/segments.sync";
import { options, jsonResponse } from "../helpers";

export const OPTIONS = options;

export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token) return jsonResponse({ error: "Failed to get access token" }, 500);

    // Each sync owns one data domain; activities must exist before the
    // resumable ride-detail backfill can process historical rides.
    const { athlete } = await syncAthlete(token);
    const segments = await syncStarredSegments(token);
    const activities = await syncActivities(token);

    return jsonResponse({
      success: true,
      athlete: athlete.firstname,
      ftp: athlete.ftp,
      weight: athlete.weight,
      starredSegments: segments.length,
      activities,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
