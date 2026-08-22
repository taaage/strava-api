import { NextRequest } from "next/server";
import { refreshAccessToken } from "@/app/services/strava.service";
import { STRAVA_API_BASE } from "@/app/config/constants";
import { corsResponse, optionsResponse } from "../cors";

const EFFORT_DURATIONS = [
  { key: "5s", seconds: 5 },
  { key: "15s", seconds: 15 },
  { key: "30s", seconds: 30 },
  { key: "1min", seconds: 60 },
  { key: "2min", seconds: 120 },
  { key: "3min", seconds: 180 },
  { key: "5min", seconds: 300 },
  { key: "8min", seconds: 480 },
  { key: "10min", seconds: 600 },
  { key: "15min", seconds: 900 },
  { key: "20min", seconds: 1200 },
  { key: "30min", seconds: 1800 },
  { key: "45min", seconds: 2700 },
  { key: "60min", seconds: 3600 },
];

function computeBestEffort(watts: number[], durationSeconds: number): number {
  if (watts.length < durationSeconds) return 0;

  let maxAvg = 0;
  let windowSum = 0;

  for (let i = 0; i < durationSeconds; i++) {
    windowSum += watts[i];
  }
  maxAvg = windowSum / durationSeconds;

  for (let i = durationSeconds; i < watts.length; i++) {
    windowSum += watts[i] - watts[i - durationSeconds];
    const avg = windowSum / durationSeconds;
    if (avg > maxAvg) maxAvg = avg;
  }

  return Math.round(maxAvg);
}

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

    // Filter rides with power data
    const rides = activities.filter(
      (a: any) =>
        (a.type === "Ride" || a.sport_type === "Ride" || a.type === "VirtualRide") &&
        a.average_watts > 0
    );

    const records: Record<string, number> = {};
    EFFORT_DURATIONS.forEach(({ key }) => (records[key] = 0));

    // Fetch power streams for each ride
    for (const ride of rides) {
      const streamRes = await fetch(
        `${STRAVA_API_BASE}/activities/${ride.id}/streams?keys=watts,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!streamRes.ok) continue;
      const stream = await streamRes.json();
      if (!stream.watts) continue;

      const watts: number[] = stream.watts.data;

      for (const { key, seconds } of EFFORT_DURATIONS) {
        const best = computeBestEffort(watts, seconds);
        if (best > records[key]) records[key] = best;
      }
    }

    return corsResponse(records, origin);
  } catch (error) {
    return corsResponse({ error: String(error) }, origin, 500);
  }
}
