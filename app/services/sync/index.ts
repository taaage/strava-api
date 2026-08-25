import { syncAthlete } from "./athlete.sync";
import { syncActivities, fetchActivitiesIncremental, fetchActivitiesFull } from "./activities.sync";
import { syncPowerRecords } from "./power.sync";
import { syncStreams } from "./streams.sync";
import { syncZones } from "./zones.sync";

export { fetchActivitiesIncremental, fetchActivitiesFull } from "./activities.sync";
export { syncStreams } from "./streams.sync";
export type { RideStream } from "./streams.sync";

export async function syncAll(activities: any[], token: string) {
  const { athlete, zonesConfig } = await syncAthlete(token);
  await syncActivities(activities);
  const { powerRides } = await syncPowerRecords(activities, token);
  await syncZones(activities, token, zonesConfig);

  return {
    athlete: athlete.firstname,
    activities: activities.length,
    powerRides,
  };
}
