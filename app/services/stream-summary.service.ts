import { readCache } from "@/app/services/db.service";

// Union of every duration (seconds) any dashboard chart needs a best-effort
// power value for — see strava-dashboard's power/utils.ts DURATIONS and
// streams/PowerCurve.tsx CURVE_DURATIONS. Precomputing these here means the
// frontend never needs the raw per-second watts array to render any chart.
export const ALL_DURATIONS: number[] = [
  1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480,
  600, 720, 900, 1200, 1500, 1800, 2400, 2700, 3000, 3600,
];

interface ZoneBoundary {
  min: number;
  max: number;
}

interface AthleteZones {
  heart_rate?: { zones: ZoneBoundary[] };
  power?: { zones: ZoneBoundary[] };
}

export interface RideStreamSummary {
  activityId: number;
  date: string;
  name: string;
  // seconds -> best average watts for that duration, within this ride.
  bestEfforts: Record<number, number>;
  avgWatts: number | null;
  avgHr: number | null;
  // True when >10% of HR samples are implausibly low (sensor dropout) —
  // mirrors the exclusion rule the dashboard used to apply client-side.
  hrDropout: boolean;
  // 5rpm bucket -> seconds spent there (coasting/0 excluded).
  cadenceHistogram: Record<number, number>;
  // Seconds spent in each zone, index-aligned with the athlete's current
  // power/HR zone boundaries. Null if zones or the relevant stream are
  // unavailable. Stale if zone boundaries change after this was computed —
  // use the recompute-stream-summaries route to refresh after an FTP change.
  powerZoneSeconds: number[] | null;
  hrZoneSeconds: number[] | null;
}

function computeBestEffort(watts: number[], durationSeconds: number): number {
  if (watts.length < durationSeconds) return 0;
  let windowSum = 0;
  for (let i = 0; i < durationSeconds; i++) windowSum += watts[i];
  let maxAvg = windowSum / durationSeconds;
  for (let i = durationSeconds; i < watts.length; i++) {
    windowSum += watts[i] - watts[i - durationSeconds];
    const avg = windowSum / durationSeconds;
    if (avg > maxAvg) maxAvg = avg;
  }
  return Math.round(maxAvg);
}

function computeBestEfforts(watts: number[]): Record<number, number> {
  const result: Record<number, number> = {};
  for (const seconds of ALL_DURATIONS) {
    result[seconds] = watts.length ? computeBestEffort(watts, seconds) : 0;
  }
  return result;
}

function computeZoneSeconds(
  values: number[] | null | undefined,
  zones: ZoneBoundary[] | undefined,
): number[] | null {
  if (!values || values.length === 0 || !zones || zones.length === 0) {
    return null;
  }
  const boundaries = zones.map((z) => ({
    min: z.min,
    max: z.max === -1 ? Infinity : z.max,
  }));
  const seconds = new Array(boundaries.length).fill(0);
  for (const value of values) {
    for (let i = 0; i < boundaries.length; i++) {
      if (value >= boundaries[i].min && value < boundaries[i].max) {
        seconds[i]++;
        break;
      }
    }
  }
  return seconds;
}

function computeCadenceHistogram(
  cadence: number[] | null | undefined,
): Record<number, number> {
  const buckets: Record<number, number> = {};
  if (!cadence) return buckets;
  for (const c of cadence) {
    if (c === 0) continue;
    const bucket = Math.floor(c / 5) * 5;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  return buckets;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Builds a small, precomputed summary of a ride's power/HR/cadence streams.
 * Pass `athleteZones` to avoid a repeated cache read when recomputing many
 * rides at once (see recomputeAllStreamSummaries in db.service.ts).
 */
export async function buildStreamSummary(
  stream: {
    activityId: number;
    date: string;
    name: string;
    watts: number[];
    heartrate: number[] | null;
    cadence: number[] | null;
  },
  athleteZones?: AthleteZones | null,
): Promise<RideStreamSummary> {
  const zones =
    athleteZones !== undefined
      ? athleteZones
      : await readCache<AthleteZones>("athlete-zones");

  const lowHrCount = stream.heartrate
    ? stream.heartrate.filter((hr) => hr < 60).length
    : 0;
  const hrDropout = stream.heartrate
    ? lowHrCount / stream.heartrate.length > 0.1
    : false;

  return {
    activityId: stream.activityId,
    date: stream.date,
    name: stream.name,
    bestEfforts: computeBestEfforts(stream.watts),
    avgWatts: average(stream.watts),
    avgHr: stream.heartrate ? average(stream.heartrate) : null,
    hrDropout,
    cadenceHistogram: computeCadenceHistogram(stream.cadence),
    powerZoneSeconds: computeZoneSeconds(stream.watts, zones?.power?.zones),
    hrZoneSeconds: computeZoneSeconds(
      stream.heartrate,
      zones?.heart_rate?.zones,
    ),
  };
}
