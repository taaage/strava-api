import { STRAVA_API_BASE } from "@/app/config/constants";
import { writeCache } from "@/app/services/cache.service";
import { EFFORT_DURATIONS, computeBestEffort, filterRidesWithPower } from "@/app/services/power.utils";

export async function syncPowerRecords(activities: any[], token: string) {
  const ridesWithPower = filterRidesWithPower(activities, 20);

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
  return { powerRides: ridesWithPower.length };
}
