import { STRAVA_API_BASE } from "@/app/config/constants";
import type { RideDetail, SegmentEffortSummary } from "@/app/services/types";

const STREAM_KEYS =
  "time,latlng,altitude,distance,velocity_smooth,grade_smooth,watts,heartrate,cadence";

export const isRide = (a: { type?: string; sport_type?: string }) =>
  a.type === "Ride" || a.sport_type === "Ride" || a.type === "VirtualRide";

// Thrown when Strava returns HTTP 429 so callers can stop and retry later.
export class RateLimitError extends Error {
  constructor() {
    super("Strava rate limit (429)");
    this.name = "RateLimitError";
  }
}

/**
 * Raw power/HR/cadence samples fetched alongside geo streams. Kept separate
 * from RideDetail so the (large, per-second) arrays are never serialized in
 * the public /api/ride-details response — only their precomputed
 * RideStreamSummary is served to the dashboard.
 */
export interface RideDetailStreams {
  detail: RideDetail;
  powerStreams: {
    watts: number[] | null;
    heartrate: number[] | null;
    cadence: number[] | null;
  };
}

/**
 * Fetches full ride data (detail + geo streams + power/HR/cadence streams +
 * segment efforts) for one activity in a single Strava streams call.
 * Returns null if the detail fetch fails (other than rate limiting, which
 * throws RateLimitError).
 *
 * `summary` is the stored activity summary, used as a fallback for core fields.
 */
export async function fetchRideDetail(
  activityId: number,
  token: string,
  summary: {
    start_date_local?: string;
    name?: string;
    type?: string;
    distance?: number;
    moving_time?: number;
    total_elevation_gain?: number;
  } = {},
): Promise<RideDetailStreams | null> {
  const headers = { Authorization: `Bearer ${token}` };

  const detailRes = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}?include_all_efforts=true`,
    { headers },
  );
  if (detailRes.status === 429) throw new RateLimitError();
  if (!detailRes.ok) return null;
  const detail = await detailRes.json();

  const streamRes = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
    { headers },
  );
  if (streamRes.status === 429) throw new RateLimitError();
  const stream = streamRes.ok ? await streamRes.json() : {};

  const segmentEfforts: SegmentEffortSummary[] = Array.isArray(
    detail.segment_efforts,
  )
    ? detail.segment_efforts.map((e: any) => ({
        id: e.id,
        segmentId: e.segment?.id ?? 0,
        name: e.name,
        elapsedTime: e.elapsed_time,
        movingTime: e.moving_time,
        distance: e.distance,
        averageWatts: e.average_watts ?? null,
        prRank: e.pr_rank ?? null,
        komRank: e.kom_rank ?? null,
      }))
    : [];

  return {
    detail: {
      activityId,
      date: detail.start_date_local ?? summary.start_date_local ?? "",
      name: detail.name ?? summary.name ?? "",
      type: detail.type ?? summary.type ?? "",
      distance: detail.distance ?? summary.distance ?? 0,
      movingTime: detail.moving_time ?? summary.moving_time ?? 0,
      totalElevationGain:
        detail.total_elevation_gain ?? summary.total_elevation_gain ?? 0,
      map: {
        polyline: detail.map?.polyline ?? null,
        summaryPolyline: detail.map?.summary_polyline ?? null,
      },
      streams: {
        time: stream.time?.data ?? null,
        latlng: stream.latlng?.data ?? null,
        altitude: stream.altitude?.data ?? null,
        distance: stream.distance?.data ?? null,
        velocity: stream.velocity_smooth?.data ?? null,
        grade: stream.grade_smooth?.data ?? null,
      },
      segmentEfforts,
    },
    powerStreams: {
      watts: stream.watts?.data ?? null,
      heartrate: stream.heartrate?.data ?? null,
      cadence: stream.cadence?.data ?? null,
    },
  };
}
