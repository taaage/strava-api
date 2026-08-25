import { STRAVA_API_BASE } from "@/app/config/constants";
import { writeCache } from "@/app/services/cache.service";
import { mapBucketsToZones, buildZoneConfig, filterRidesWithPower, ZONE_NAMES } from "@/app/services/power.utils";

export async function syncZones(activities: any[], token: string, zonesConfig: any) {
  const ridesWithPower = filterRidesWithPower(activities, 20);

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

  await writeCache("zones", {
    power: mapBucketsToZones(rawPowerBuckets, buildZoneConfig(zonesConfig.power?.zones ?? [], ZONE_NAMES.power)),
    hr: mapBucketsToZones(rawHrBuckets, buildZoneConfig(zonesConfig.heart_rate?.zones ?? [], ZONE_NAMES.hr)),
  });
}
