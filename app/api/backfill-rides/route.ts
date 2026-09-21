import {
  getActivities,
  getRideDetailIds,
  upsertRideDetail,
  upsertRideStream,
} from "@/app/services/db.service";
import { refreshAccessToken } from "@/app/services/strava.service";
import {
  fetchRideDetail,
  isRide,
  RateLimitError,
} from "@/app/services/ride-detail.service";
import { buildStreamSummary } from "@/app/services/stream-summary.service";
import type { RideDetail, RideStream } from "@/app/services/types";
import { jsonResponse, options } from "../helpers";

// Each ride is one Strava streams call (geo + power/HR/cadence merged) plus
// the detail call. Strava's default limit is 100 req / 15 min, so 20 rides =
// 40 calls per invocation.
const BATCH_SIZE = 20;

export const OPTIONS = options;

/**
 * Batched, resumable backfill of full ride data: GPS/geo streams, segments
 * (ride_details) and power/HR/cadence streams + summary (ride_streams).
 *
 * Idempotent: skips rides already stored in `ride_details`. Call repeatedly
 * until `remaining` reaches 0.
 */
export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token) {
      return jsonResponse({ error: "Failed to get access token" }, 500);
    }

    const activities: any[] = await getActivities();
    if (activities.length === 0) {
      return jsonResponse(
        { error: "No activities stored. Run initial sync first." },
        400,
      );
    }

    const rides = activities.filter(isRide);

    const processedIds = await getRideDetailIds();
    const unprocessed = rides.filter((a: any) => !processedIds.has(a.id));

    if (unprocessed.length === 0) {
      return jsonResponse({
        success: true,
        message: "All rides already processed",
        total: rides.length,
        stored: processedIds.size,
      });
    }

    const batch = unprocessed.slice(0, BATCH_SIZE);
    const newDetails: RideDetail[] = [];
    let streamsStored = 0;
    let rateLimited = false;

    for (const ride of batch) {
      try {
        const result = await fetchRideDetail(ride.id, token, ride);
        if (result) {
          await upsertRideDetail(result.detail);
          newDetails.push(result.detail);

          if (ride.average_watts > 0 && result.powerStreams.watts) {
            const rideStream: RideStream = {
              activityId: ride.id,
              date: ride.start_date_local,
              name: ride.name,
              watts: result.powerStreams.watts,
              heartrate: result.powerStreams.heartrate,
              cadence: result.powerStreams.cadence,
            };
            await upsertRideStream(
              rideStream,
              await buildStreamSummary(rideStream),
            );
            streamsStored++;
          }
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          rateLimited = true;
          break;
        }
        throw err;
      }
    }

    const remaining = unprocessed.length - newDetails.length;
    const stored = processedIds.size + newDetails.length;

    return jsonResponse({
      success: true,
      processed: newDetails.length,
      streamsStored,
      remaining,
      total: rides.length,
      stored,
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
