export interface RideStream {
  activityId: number;
  date: string;
  name: string;
  watts: number[];
  heartrate: number[] | null;
  cadence: number[] | null;
}

// A lightweight segment effort summary attached to a ride.
export interface SegmentEffortSummary {
  id: number;
  segmentId: number;
  name: string;
  elapsedTime: number;
  movingTime: number;
  distance: number;
  averageWatts: number | null;
  prRank: number | null;
  komRank: number | null;
}

// Full ride data for maps, elevation profiles, and segment analysis.
// Stores GPS + geo streams (indexed by data point) plus segment efforts.
export interface RideDetail {
  activityId: number;
  date: string;
  name: string;
  type: string;
  distance: number;
  movingTime: number;
  totalElevationGain: number;
  // Encoded polyline (summary) for quick map previews.
  map: {
    polyline: string | null;
    summaryPolyline: string | null;
  };
  // Geo/streams — each array is indexed by data point (aligned with `time`).
  streams: {
    time: number[] | null;
    latlng: [number, number][] | null;
    altitude: number[] | null;
    distance: number[] | null;
    velocity: number[] | null;
    grade: number[] | null;
  };
  segmentEfforts: SegmentEffortSummary[];
}
