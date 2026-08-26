import { refreshAccessToken } from "@/app/services/strava.service";
import { syncAthlete } from "@/app/services/athlete.sync";
import { options, jsonResponse } from "../helpers";

export const OPTIONS = options;

export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token) return jsonResponse({ error: "Failed to get access token" }, 500);

    const { athlete } = await syncAthlete(token);

    return jsonResponse({
      success: true,
      athlete: athlete.firstname,
      ftp: athlete.ftp,
      weight: athlete.weight,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
