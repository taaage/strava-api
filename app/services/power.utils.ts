export const EFFORT_DURATIONS = [
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

export const ZONE_NAMES = {
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

export function computeBestEffort(watts: number[], durationSeconds: number): number {
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

/**
 * Converts Strava's zone boundaries from /athlete/zones into our zone config format.
 * Strava returns: { zones: [{ min: 0, max: 180 }, { min: 180, max: 240 }, ...] }
 */
export function buildZoneConfig(
  stravaZones: { min: number; max: number }[],
  names: string[],
): { min: number; max: number; name: string }[] {
  return stravaZones.map((z, i) => ({
    min: z.min,
    max: z.max === -1 ? 9999 : z.max,
    name: names[i] ?? `Z${i + 1}`,
  }));
}

export function mapBucketsToZones(
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

export function filterRidesWithPower(activities: any[], limit?: number) {
  const rides = activities.filter(
    (a: any) =>
      (a.type === "Ride" || a.sport_type === "Ride" || a.type === "VirtualRide") &&
      a.average_watts > 0,
  );
  return limit ? rides.slice(0, limit) : rides;
}
