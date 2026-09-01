import { readCache, writeCache } from "@/app/services/cache.service";
import { refreshAccessToken } from "@/app/services/strava.service";
import {
  fetchRideDetail,
  isRide,
  RateLimitError,
} from "@/app/services/ride-detail.service";
import type { RideDetail } from "@/app/services/types";
import { jsonResponse, options } from "../helpers";

// Full-detail fetches are 2 API calls each (detail + streams). Strava's default
// limit is 100 req / 15 min, so 20 rides = 40 calls per invocation.
const BATCH_SIZE = 20;

export const OPTIONS = options;

/**
 * Batched, resumable backfill of full ride data (GPS, geo streams, segments).
 *
 * Idempotent: skips rides already stored in `ride-details`. Call repeatedly
 * until `remaining` reaches 0.
 */
export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token) {
      return jsonResponse({ error: "Failed to get access token" }, 500);
    }

    const activities: any[] = (await readCache("activities")) || [];
    if (activities.length === 0) {
      return jsonResponse(
        { error: "No activities stored. Run initial sync first." },
        400,
      );
    }

    const rides = activities.filter(isRide);

    const existing: RideDetail[] = (await readCache("ride-details")) || [];
    const processedIds = new Set(existing.map((r) => r.activityId));
    const unprocessed = rides.filter((a: any) => !processedIds.has(a.id));

    if (unprocessed.length === 0) {
      return jsonResponse({
        success: true,
        message: "All rides already processed",
        total: rides.length,
        stored: existing.length,
      });
    }

    const batch = unprocessed.slice(0, BATCH_SIZE);
    const newDetails: RideDetail[] = [];
    let rateLimited = false;

    for (const ride of batch) {
      try {
        const detail = await fetchRideDetail(ride.id, token, ride);
        if (detail) newDetails.push(detail);
      } catch (err) {
        if (err instanceof RateLimitError) {
          rateLimited = true;
          break;
        }
        throw err;
      }
    }

    const all = [...existing, ...newDetails];
    if (newDetails.length > 0) {
      await writeCache("ride-details", all);
    }

    const remaining = unprocessed.length - newDetails.length;

    return jsonResponse({
      success: true,
      processed: newDetails.length,
      remaining,
      total: rides.length,
      stored: all.length,
      rateLimited,
      message: rateLimited
        ? `Rate limited by Strava. Processed ${newDetails.length}, wait ~15 min then call again (${remaining} remaining).`
        : remaining > 0
          ? `Call again to process next batch (${remaining} remaining).`
          : "Backfill complete.",
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
