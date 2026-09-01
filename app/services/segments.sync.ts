import { STRAVA_API_BASE } from "@/app/config/constants";
import { writeCache } from "@/app/services/cache.service";
import type { StarredSegment } from "@/app/services/types";

const PER_PAGE = 200;
const MAX_PAGES = 20; // safety cap (up to 4000 starred segments)

function mapSegment(s: any): StarredSegment {
  return {
    id: s.id,
    name: s.name,
    activityType: s.activity_type,
    distance: s.distance,
    averageGrade: s.average_grade,
    maximumGrade: s.maximum_grade,
    elevationHigh: s.elevation_high,
    elevationLow: s.elevation_low,
    climbCategory: s.climb_category,
    city: s.city ?? null,
    state: s.state ?? null,
    country: s.country ?? null,
    private: s.private ?? false,
    prTime: s.athlete_pr_effort?.elapsed_time ?? s.pr_time ?? null,
    starredAt: s.starred_date ?? null,
  };
}

/**
 * Fetches all starred segments from Strava (paginated) and caches them under
 * `starred-segments`. Self-contained — owns only segment data.
 *
 * Returns the list of starred segments.
 */
export async function syncStarredSegments(
  token: string,
): Promise<StarredSegment[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const all: StarredSegment[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `${STRAVA_API_BASE}/segments/starred?per_page=${PER_PAGE}&page=${page}`,
      { headers },
    );
    if (!res.ok) break;

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch.map(mapSegment));

    // Last page reached when fewer than a full page is returned.
    if (batch.length < PER_PAGE) break;
  }

  await writeCache("starred-segments", all);
  return all;
}
