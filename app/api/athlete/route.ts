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

    const response = await fetch(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    return corsResponse(data, origin);
  } catch (error) {
    return corsResponse({ error: String(error) }, origin, 500);
  }
}
