import { NextRequest } from "next/server";
import { refreshAccessToken } from "@/app/services/strava.service";
import { STRAVA_API_BASE } from "@/app/config/constants";
import { corsResponse, optionsResponse } from "../cors";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const params = request.nextUrl.searchParams;
  const pages = parseInt(params.get("pages") || "10");
  const perPage = parseInt(params.get("per_page") || "100");

  try {
    const token = await refreshAccessToken();
    if (!token) {
      return corsResponse({ error: "Failed to get access token" }, origin, 500);
    }

    const allActivities = [];
    for (let page = 1; page <= pages; page++) {
      const response = await fetch(
        `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=${perPage}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const activities = await response.json();
      allActivities.push(...activities);
      if (activities.length < perPage) break;
    }

    return corsResponse(allActivities, origin);
  } catch (error) {
    return corsResponse({ error: String(error) }, origin, 500);
  }
}
