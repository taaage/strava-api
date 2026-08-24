import { STRAVA_API_BASE } from "@/app/config/constants";
import { readCache, writeCache } from "@/app/services/cache.service";
import { refreshAccessToken } from "@/app/services/strava.service";
import { jsonResponse, options } from "../helpers";

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
  for (let i = 0; i < durationSeconds; i++) windowSum += watts[i];
  maxAvg = windowSum / durationSeconds;
  for (let i = durationSeconds; i < watts.length; i++) {
    windowSum += watts[i] - watts[i - durationSeconds];
    const avg = windowSum / durationSeconds;
    if (avg > maxAvg) maxAvg = avg;
  }
  return Math.round(maxAvg);
}

export const OPTIONS = options;

export async function GET(request: Request) {
  try {
    const token = await refreshAccessToken();
    if (!token) {
      return jsonResponse({ error: "Failed to get access token" }, 500);
    }

    // 1. Fetch athlete
    const athleteRes = await fetch(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const athlete = await athleteRes.json();
    await writeCache("athlete", athlete);

    // 2. Fetch stats
    const statsRes = await fetch(
      `${STRAVA_API_BASE}/athletes/${athlete.id}/stats`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const stats = await statsRes.json();
    await writeCache("stats", stats);

    // 3. Fetch activities (incremental - merge with existing)
    const existingActivities: any[] = (await readCache("activities")) || [];
    const existingIds = new Set(existingActivities.map((a: any) => a.id));

    // Check if full sync requested or just incremental
    const params = new URL(request.url).searchParams;
    const fullSync = params.get("full") === "true";
    const maxPages = fullSync ? 20 : 2;

    const newActivities = [];
    let done = false;
    for (let page = 1; page <= maxPages && !done; page++) {
      const res = await fetch(
        `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const activity of data) {
        if (!fullSync && existingIds.has(activity.id)) {
          done = true;
          break;
        }
        if (!existingIds.has(activity.id)) {
          newActivities.push(activity);
        }
      }

      if (data.length < 100) break;
    }

    const allActivities = [...newActivities, ...existingActivities];
    await writeCache("activities", allActivities);

    // 4. Compute power records from last 20 rides with power
    const ridesWithPower = allActivities
      .filter(
        (a: any) =>
          (a.type === "Ride" ||
            a.sport_type === "Ride" ||
            a.type === "VirtualRide") &&
          a.average_watts > 0,
      )
      .slice(0, 20);

    const records: Record<string, number> = {};
    EFFORT_DURATIONS.forEach(({ key }) => (records[key] = 0));

    for (const ride of ridesWithPower) {
      const streamRes = await fetch(
        `${STRAVA_API_BASE}/activities/${ride.id}/streams?keys=watts,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!streamRes.ok) continue;
      const stream = await streamRes.json();
      if (!stream.watts) continue;

      for (const { key, seconds } of EFFORT_DURATIONS) {
        const best = computeBestEffort(stream.watts.data, seconds);
        if (best > records[key]) records[key] = best;
      }
    }
    await writeCache("power-records", records);

    // 5. Fetch zones from last 20 rides
    const powerZones: Record<string, number> = {};
    const hrZones: Record<string, number> = {};

    for (const ride of ridesWithPower) {
      const zonesRes = await fetch(
        `${STRAVA_API_BASE}/activities/${ride.id}/zones`,
        { headers: { Authorization: `Bearer ${token}` } },
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
    await writeCache("zones", { powerZones, hrZones });

    return jsonResponse({
      success: true,
      synced: {
        athlete: athlete.firstname,
        activities: allActivities.length,
        newActivities: newActivities.length,
        powerRides: ridesWithPower.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
