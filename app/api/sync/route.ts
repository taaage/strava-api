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

    // 3. Fetch activities
    const params = new URL(request.url).searchParams;
    const fullSync = params.get("full") === "true";

    let allActivities: any[] = [];

    if (fullSync) {
      // Full: replace blob with fresh Strava data
      for (let page = 1; page <= 20; page++) {
        const res = await fetch(
          `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        allActivities.push(...data);
        if (data.length < 100) break;
      }
    } else {
      // Incremental: only add new activities
      const existingActivities: any[] = (await readCache("activities")) || [];
      const existingIds = new Set(existingActivities.map((a: any) => a.id));
      const newActivities: any[] = [];
      let done = false;

      for (let page = 1; page <= 2 && !done; page++) {
        const res = await fetch(
          `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;

        for (const activity of data) {
          if (existingIds.has(activity.id)) {
            done = true;
            break;
          }
          newActivities.push(activity);
        }
        if (data.length < 100) break;
      }

      allActivities = [...newActivities, ...existingActivities];
    }

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

    // 5. Fetch zones from last 20 rides and map to configured zones
    const POWER_ZONES = [
      { min: 0, max: 179, name: "Z1 Recovery" },
      { min: 180, max: 235, name: "Z2 Endurance" },
      { min: 236, max: 309, name: "Z3 Tempo" },
      { min: 310, max: 344, name: "Z4 Threshold" },
      { min: 345, max: 399, name: "Z5 VO2max" },
      { min: 400, max: 446, name: "Z6 Anaerobic" },
      { min: 447, max: 9999, name: "Z7 Neuromuscular" },
    ];
    const HR_ZONES = [
      { min: 0, max: 134, name: "Z1 Recovery" },
      { min: 135, max: 154, name: "Z2 Endurance" },
      { min: 155, max: 169, name: "Z3 Tempo" },
      { min: 170, max: 184, name: "Z4 Threshold" },
      { min: 185, max: 9999, name: "Z5 VO2max" },
    ];

    const rawPowerBuckets: Record<string, number> = {};
    const rawHrBuckets: Record<string, number> = {};

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
            rawPowerBuckets[key] = (rawPowerBuckets[key] || 0) + (bucket.time || 0);
          }
        }
        if (zone.type === "heartrate" && zone.distribution_buckets) {
          for (const bucket of zone.distribution_buckets) {
            const key = `${bucket.min}-${bucket.max}`;
            rawHrBuckets[key] = (rawHrBuckets[key] || 0) + (bucket.time || 0);
          }
        }
      }
    }

    // Map raw buckets proportionally to configured zones
    function mapBucketsToZones(buckets: Record<string, number>, zoneConfig: { min: number; max: number; name: string }[]) {
      const result = zoneConfig.map((z) => ({ name: z.name, seconds: 0 }));

      Object.entries(buckets).forEach(([key, time]) => {
        const parts = key.split("-");
        const bucketMin = parseInt(parts[0]);
        const bucketMax = parts[1] === "-1" ? 9999 : parseInt(parts[1]);
        const bucketRange = bucketMax - bucketMin;

        if (bucketRange <= 0) {
          result[0].seconds += time;
          return;
        }

        for (let i = 0; i < zoneConfig.length; i++) {
          const overlapMin = Math.max(bucketMin, zoneConfig[i].min);
          const overlapMax = Math.min(bucketMax, zoneConfig[i].max);
          if (overlapMin < overlapMax) {
            result[i].seconds += time * ((overlapMax - overlapMin) / bucketRange);
          }
        }
      });

      const total = result.reduce((s, z) => s + z.seconds, 0);
      return result.map((z) => ({
        name: z.name,
        seconds: Math.round(z.seconds),
        hours: Math.round((z.seconds / 3600) * 10) / 10,
        percentage: total > 0 ? Math.round((z.seconds / total) * 100) : 0,
      }));
    }

    await writeCache("zones", {
      power: mapBucketsToZones(rawPowerBuckets, POWER_ZONES),
      hr: mapBucketsToZones(rawHrBuckets, HR_ZONES),
    });

    return jsonResponse({
      success: true,
      synced: {
        athlete: athlete.firstname,
        activities: allActivities.length,
        fullSync,
        powerRides: ridesWithPower.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
