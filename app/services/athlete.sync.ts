import { STRAVA_API_BASE } from "@/app/config/constants";
import { writeCache } from "@/app/services/cache.service";

export async function syncAthlete(token: string) {
  const athleteRes = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const athlete = await athleteRes.json();
  await writeCache("athlete", athlete);

  const zonesConfigRes = await fetch(`${STRAVA_API_BASE}/athlete/zones`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const zonesConfig = await zonesConfigRes.json();
  await writeCache("athlete-zones", zonesConfig);

  const statsRes = await fetch(
    `${STRAVA_API_BASE}/athletes/${athlete.id}/stats`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const stats = await statsRes.json();
  await writeCache("stats", stats);

  return { athlete, zonesConfig };
}
