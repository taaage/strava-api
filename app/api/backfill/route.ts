import { STRAVA_API_BASE } from "@/app/config/constants";
import { readCache, writeCache } from "@/app/services/cache.service";
import { refreshAccessToken } from "@/app/services/strava.service";
import type { RideStream } from "@/app/services/sync/streams.sync";
import { jsonResponse, options } from "../helpers";

const BATCH_SIZE = 80;

export const OPTIONS = options;

export async function GET() {
  try {
    const token = await refreshAccessToken();
    if (!token)
      return jsonResponse({ error: "Failed to get access token" }, 500);

    // Get all stored activities
    const activities: any[] = (await readCache("activities")) || [];
    if (activities.length === 0) {
      return jsonResponse(
        { error: "No activities stored. Run initial sync first." },
        400,
      );
    }

    // Get rides with power
    const ridesWithPower = activities.filter(
      (a: any) =>
        (a.type === "Ride" ||
          a.sport_type === "Ride" ||
          a.type === "VirtualRide") &&
        a.average_watts > 0,
    );

    // Get already-stored streams
    const existingStreams: RideStream[] =
      (await readCache("ride-streams")) || [];
    const processedIds = new Set(existingStreams.map((s) => s.activityId));

    // Find unprocessed rides
    const unprocessed = ridesWithPower.filter(
      (a: any) => !processedIds.has(a.id),
    );

    if (unprocessed.length === 0) {
      return jsonResponse({
        success: true,
        message: "All rides already processed",
        total: ridesWithPower.length,
        stored: existingStreams.length,
      });
    }

    // Process next batch
    const batch = unprocessed.slice(0, BATCH_SIZE);
    const newStreams: RideStream[] = [];

    for (const ride of batch) {
      const res = await fetch(
        `${STRAVA_API_BASE}/activities/${ride.id}/streams?keys=watts,heartrate,cadence&key_by_type=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;
      const stream = await res.json();
      if (!stream.watts?.data) continue;

      newStreams.push({
        activityId: ride.id,
        date: ride.start_date_local,
        name: ride.name,
        watts: stream.watts.data,
        heartrate: stream.heartrate?.data ?? null,
        cadence: stream.cadence?.data ?? null,
      });
    }

    // Append to existing and save
    const allStreams = [...existingStreams, ...newStreams];
    await writeCache("ride-streams", allStreams);

    const remaining = unprocessed.length - batch.length;

    return jsonResponse({
      success: true,
      processed: newStreams.length,
      remaining,
      total: ridesWithPower.length,
      stored: allStreams.length,
      message:
        remaining > 0
          ? `Call again to process next batch (${remaining} remaining)`
          : "Backfill complete",
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}
