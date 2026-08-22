import { NextRequest } from "next/server";
import { refreshAccessToken } from "@/app/services/strava.service";
import { STRAVA_API_BASE } from "@/app/config/constants";
import { corsResponse, optionsResponse } from "../cors";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const token = await refreshAccessToken();
    if (!token) {
      return corsResponse({ error: "Failed to get access token" }, origin, 500);
    }

    // First get athlete ID
    const athleteRes = await fetch(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const athlete = await athleteRes.json();

    // Then get stats
    const statsRes = await fetch(`${STRAVA_API_BASE}/athletes/${athlete.id}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stats = await statsRes.json();

    return corsResponse(stats, origin);
  } catch (error) {
    return corsResponse({ error: String(error) }, origin, 500);
  }
}
