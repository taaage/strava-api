import { refreshAccessToken } from "@/app/services/strava.service";
import { fetchActivitiesIncremental, syncStreams } from "@/app/services/sync";
import { readCache } from "@/app/services/cache.service";
import { options, jsonResponse } from "../helpers";

export const OPTIONS = options;

export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token) return jsonResponse({ error: "Failed to get access token" }, 500);

    // Use cached activities if available, otherwise fetch
    let activities: any[] = (await readCache("activities")) || [];
    if (activities.length === 0) {
      activities = await fetchActivitiesIncremental(token);
    }

    const result = await syncStreams(activities, token, 20);

    return jsonResponse({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
