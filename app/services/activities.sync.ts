import { STRAVA_API_BASE } from "@/app/config/constants";
import { upsertActivity } from "@/app/services/db.service";

const PER_PAGE = 200;
const MAX_PAGES = 20;

/**
 * Fetches the athlete's historical activity list and writes each activity as
 * its own row. The safety cap covers up to 4,000 activities per sync.
 */
export async function syncActivities(token: string): Promise<number> {
  const headers = { Authorization: `Bearer ${token}` };
  let stored = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?per_page=${PER_PAGE}&page=${page}`,
      { headers },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to fetch Strava activities (page ${page}, ${response.status}): ${body}`,
      );
    }

    const activities: unknown = await response.json();
    if (!Array.isArray(activities)) {
      throw new Error(
        `Strava activities response on page ${page} was not an array`,
      );
    }

    for (const activity of activities) {
      await upsertActivity(activity);
      stored++;
    }

    if (activities.length < PER_PAGE) break;
  }

  return stored;
}
