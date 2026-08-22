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
  const maxActivities = parseInt(params.get("max") || "20");

  try {
    const token = await refreshAccessToken();
    if (!token) {
      return corsResponse({ error: "Failed to get access token" }, origin, 500);
    }

    // Fetch recent activities
    const activitiesRes = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?per_page=${maxActivities}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const activities = await activitiesRes.json();

    if (!Array.isArray(activities)) {
      return corsResponse({ error: "Strava API error", details: activities }, origin, 502);
    }

    // Filter rides only
    const rides = activities.filter(
      (a: any) => a.type === "Ride" || a.sport_type === "Ride" || a.type === "VirtualRide"
    );

    // Aggregate zone data across all rides
    const powerZones: Record<string, number> = {};
    const hrZones: Record<string, number> = {};

    for (const ride of rides) {
      const zonesRes = await fetch(
        `${STRAVA_API_BASE}/activities/${ride.id}/zones`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!zonesRes.ok) continue;
      const zones = await zonesRes.json();

      if (!Array.isArray(zones)) continue;

      for (const zone of zones) {
        if (zone.type === "power" && zone.distribution_buckets) {
          for (const bucket of zone.distribution_buckets) {
            const key = `${bucket.min}-${bucket.max}`;
            powerZones[key] = (powerZones[key] || 0) + (bucket.time || 0);
          }
        }
        if (zone.type === "heartrate" && zone.distribution_buckets) {
          for (const bucket of zone.distribution_buckets) {
            const key = `${bucket.min}-${bucket.max}`;
            hrZones[key] = (hrZones[key] || 0) + (bucket.time || 0);
          }
        }
      }
    }

    return corsResponse({ powerZones, hrZones }, origin, 200, 86400); // Cache 24h
  } catch (error) {
    return corsResponse({ error: String(error) }, origin, 500);
  }
}
