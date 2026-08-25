import { refreshAccessToken } from "@/app/services/strava.service";
import { fetchActivitiesFull, syncAll } from "@/app/services/sync";
import { options, jsonResponse } from "../helpers";

export const OPTIONS = options;

export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token) return jsonResponse({ error: "Failed to get access token" }, 500);

    const activities = await fetchActivitiesFull(token);
    const result = await syncAll(activities, token);

    return jsonResponse({ success: true, synced: result, timestamp: new Date().toISOString() });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
