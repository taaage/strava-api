import { STRAVA_API_BASE } from "@/app/config/constants";
import { writeCache } from "@/app/services/cache.service";
import { filterRidesWithPower } from "@/app/services/power.utils";

export interface RideStream {
  activityId: number;
  date: string;
  name: string;
  watts: number[];
  heartrate: number[] | null;
  cadence: number[] | null;
}

export async function syncStreams(activities: any[], token: string, limit = 20) {
  const ridesWithPower = filterRidesWithPower(activities, limit);
  const streams: RideStream[] = [];

  for (const ride of ridesWithPower) {
    const res = await fetch(
      `${STRAVA_API_BASE}/activities/${ride.id}/streams?keys=watts,heartrate,cadence&key_by_type=true`,
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
