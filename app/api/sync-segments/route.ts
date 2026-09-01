import { refreshAccessToken } from "@/app/services/strava.service";
import { syncStarredSegments } from "@/app/services/segments.sync";
import { options, jsonResponse } from "../helpers";

export const OPTIONS = options;

// Manual on-demand refresh of starred segments (no need to wait for the cron).
export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token) return jsonResponse({ error: "Failed to get access token" }, 500);

    const segments = await syncStarredSegments(token);

    return jsonResponse({
      success: true,
      starredSegments: segments.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
