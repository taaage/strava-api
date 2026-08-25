import { STRAVA_API_BASE } from "@/app/config/constants";
import { readCache, writeCache } from "@/app/services/cache.service";

export async function fetchActivitiesIncremental(token: string): Promise<any[]> {
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

export async function syncActivities(activities: any[]) {
  await writeCache("activities", activities);
}
