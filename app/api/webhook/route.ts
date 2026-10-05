import {
  upsertActivity,
  deleteActivity,
  upsertRideStream,
  deleteRideStream,
  upsertRideDetail,
  deleteRideDetail,
} from "@/app/services/db.service";
import { buildStreamSummary } from "@/app/services/stream-summary.service";
import {
  getActivity,
  markActivityAsCommute,
} from "@/app/services/strava.service";
import { refreshAccessToken } from "@/app/services/strava-auth.service";
import { isCommuteActivity } from "@/app/services/commute.service";
import { syncAthlete } from "@/app/services/athlete.sync";
import { fetchRideDetail } from "@/app/services/ride-detail.service";
import type { RideDetail, RideStream } from "@/app/services/types";
import { NextRequest, NextResponse } from "next/server";

const RIDLEY_GEAR_ID = "b17548680";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": challenge });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();
    console.log("[WEBHOOK] Event received:", JSON.stringify(event));

    const token = await refreshAccessToken();
    if (!token) {
      console.error("[WEBHOOK] Failed to refresh access token");
      return NextResponse.json({ error: "No token" }, { status: 500 });
    }
    console.log("[WEBHOOK] Token refreshed successfully");

    if (event.object_type === "activity") {
      await handleActivityEvent(event, token);
    } else if (
      event.object_type === "athlete" &&
      event.aspect_type === "update"
    ) {
      await syncAthlete(token);
    }

    console.log("[WEBHOOK] Processing complete");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WEBHOOK] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

async function handleActivityEvent(event: any, token: string) {
  const activityId = event.object_id;

  if (event.aspect_type === "create") {
    await handleActivityCreate(activityId, token);
  } else if (event.aspect_type === "update") {
    await handleActivityUpdate(activityId, token);
  } else if (event.aspect_type === "delete") {
    await handleActivityDelete(activityId);
  }
}

async function handleActivityCreate(activityId: number, token: string) {
  // Fetch full activity
  console.log("[WEBHOOK] Fetching activity:", activityId);
  const activity = await getActivity(activityId, token);
  console.log("[WEBHOOK] Activity fetched:", activity.id, activity.name ?? "NO NAME - possible error");

  if (activity.errors || activity.message) {
    console.error("[WEBHOOK] Strava API error:", JSON.stringify(activity));
    return;
  }

  const isCommuteRide =
    (activity.type === "Ride" || activity.sport_type === "Ride") &&
    isCommuteActivity(activity);
  if (isCommuteRide) {
    try {
      await markActivityAsCommute(activityId, token, RIDLEY_GEAR_ID);
      activity.commute = true;
      activity.gear_id = RIDLEY_GEAR_ID;
      console.log("[WEBHOOK] Commute matched and updated:", activityId);
    } catch (error) {
      console.error(
        "[WEBHOOK] Commute update failed; continuing activity sync:",
        error,
      );
    }
  }

  // Upsert this single activity -- no need to read/write the full history.
  await upsertActivity(activity);
  console.log("[WEBHOOK] Activity cached:", activityId);

  // Fetch full ride detail (GPS/geo streams, segments) + power/HR/cadence
  // streams in one Strava call, and store both.
  const isRide =
    activity.type === "Ride" ||
    activity.sport_type === "Ride" ||
    activity.type === "VirtualRide";
  if (isRide) {
    try {
      const result = await fetchRideDetail(activityId, token, activity);
      if (result) {
        await upsertRideDetail(result.detail);
        console.log("[WEBHOOK] Ride detail stored:", activityId);

        if (activity.average_watts > 0 && result.powerStreams.watts) {
          const rideStream: RideStream = {
            activityId,
            date: activity.start_date_local,
            name: activity.name,
            watts: result.powerStreams.watts,
            heartrate: result.powerStreams.heartrate,
            cadence: result.powerStreams.cadence,
          };
          await upsertRideStream(
            rideStream,
            await buildStreamSummary(rideStream),
          );
          console.log("[WEBHOOK] Ride stream stored:", activityId);
        }
      }
    } catch (err) {
      console.error("[WEBHOOK] Ride detail capture failed (non-blocking):", err);
    }
  }
}

async function handleActivityUpdate(activityId: number, token: string) {
  console.log("[WEBHOOK] Updating activity:", activityId);
  const activity = await getActivity(activityId, token);

  if (activity.errors || activity.message) {
    console.error("[WEBHOOK] Strava API error:", JSON.stringify(activity));
    return;
  }

  await upsertActivity(activity);
  console.log("[WEBHOOK] Activity updated in cache:", activityId);
}

async function handleActivityDelete(activityId: number) {
  await deleteActivity(activityId);
  await deleteRideStream(activityId);
  await deleteRideDetail(activityId);
}
