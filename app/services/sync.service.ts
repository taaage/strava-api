import { refreshAccessToken } from "@/app/services/strava.service";
import { STRAVA_API_BASE } from "@/app/config/constants";
import { writeCache, readCache } from "@/app/services/cache.service";

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

const ZONE_NAMES = {
  power: [
    "Z1 Recovery",
    "Z2 Endurance",
    "Z3 Tempo",
    "Z4 Threshold",
    "Z5 VO2max",
    "Z6 Anaerobic",
    "Z7 Neuromuscular",
  ],
  hr: ["Z1 Recovery", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 VO2max"],
};

/**
 * Converts Strava's zone boundaries from /athlete/zones into our zone config format.
 * Strava returns: { zones: [{ min: 0, max: 180 }, { min: 180, max: 240 }, ...] }
 */
function buildZoneConfig(
  stravaZones: { min: number; max: number }[],
  names: string[],
): { min: number; max: number; name: string }[] {
  return stravaZones.map((z, i) => ({
    min: z.min,
    max: z.max === -1 ? 9999 : z.max,
    name: names[i] ?? `Z${i + 1}`,
  }));
}

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

function mapBucketsToZones(
  buckets: Record<string, number>,
  zoneConfig: { min: number; max: number; name: string }[],
) {
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

export async function fetchActivitiesIncremental(
  token: string,
): Promise<any[]> {
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

  return [...newActivities, ...existingActivities];
}

export async function fetchActivitiesFull(token: string): Promise<any[]> {
  const allActivities: any[] = [];
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
  return allActivities;
}

export interface RideStream {
  activityId: number;
  date: string;
  name: string;
  watts: number[];
  heartrate: number[] | null;
  cadence: number[] | null;
}

export async function fetchAndStoreStreams(
  activities: any[],
  token: string,
  limit = 20,
) {
  const ridesWithPower = activities
    .filter(
      (a: any) =>
        (a.type === "Ride" ||
          a.sport_type === "Ride" ||
          a.type === "VirtualRide") &&
        a.average_watts > 0,
    )
    .slice(0, limit);

  const streams: RideStream[] = [];

  for (const ride of ridesWithPower) {
    const res = await fetch(
      `${STRAVA_API_BASE}/activities/${ride.id}/streams?keys=watts,heartrate,cadence,time&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) continue;
    const stream = await res.json();
    if (!stream.watts?.data) continue;

    streams.push({
      activityId: ride.id,
      date: ride.start_date_local,
      name: ride.name,
      watts: stream.watts.data,
      heartrate: stream.heartrate?.data ?? null,
      cadence: stream.cadence?.data ?? null,
    });
  }

  await writeCache("ride-streams", streams);
  return { stored: streams.length, rides: ridesWithPower.length };
}

export async function syncAll(activities: any[], token: string) {
  // Athlete
  const athleteRes = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const athlete = await athleteRes.json();
  await writeCache("athlete", athlete);

  // Athlete zones (HR + power boundaries from Strava settings)
  const zonesConfigRes = await fetch(`${STRAVA_API_BASE}/athlete/zones`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const zonesConfig = await zonesConfigRes.json();
  await writeCache("athlete-zones", zonesConfig);

  // Stats
  const statsRes = await fetch(
    `${STRAVA_API_BASE}/athletes/${athlete.id}/stats`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const stats = await statsRes.json();
  await writeCache("stats", stats);

  // Save activities
  await writeCache("activities", activities);

  // Power records from last 20 rides
  const ridesWithPower = activities
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

  // Zones from last 20 rides
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
          rawPowerBuckets[key] =
            (rawPowerBuckets[key] || 0) + (bucket.time || 0);
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

  await writeCache("zones", {
    power: mapBucketsToZones(
      rawPowerBuckets,
      buildZoneConfig(zonesConfig.power?.zones ?? [], ZONE_NAMES.power),
    ),
    hr: mapBucketsToZones(
      rawHrBuckets,
      buildZoneConfig(zonesConfig.heart_rate?.zones ?? [], ZONE_NAMES.hr),
    ),
  });

  return {
    athlete: athlete.firstname,
    activities: activities.length,
    powerRides: ridesWithPower.length,
  };
}
