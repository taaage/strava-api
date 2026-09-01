import { STRAVA_API_BASE } from "@/app/config/constants";
import { generateDescription } from "@/app/services/ai.service";
import { readCache, writeCache } from "@/app/services/cache.service";
import {
  getActivity,
  refreshAccessToken,
  updateActivityDescription,
} from "@/app/services/strava.service";
import { syncAthlete } from "@/app/services/athlete.sync";
import { fetchRideDetail } from "@/app/services/ride-detail.service";
import type { RideDetail, RideStream } from "@/app/services/types";
import { NextRequest, NextResponse } from "next/server";

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

  // Generate and set AI description
  const description = await generateDescription(activity);
  console.log("[WEBHOOK] AI description generated");
  await updateActivityDescription(activityId, token, description);

  // Append to stored activities (deduplicate)
  const activities: any[] = (await readCache("activities")) || [];
  const existingIndex = activities.findIndex((a: any) => a.id === activityId);
  if (existingIndex >= 0) {
    activities[existingIndex] = activity;
  } else {
    activities.unshift(activity);
  }
  await writeCache("activities", activities);
  console.log("[WEBHOOK] Activities cache updated, total:", activities.length);

  // Fetch and store stream if it's a ride with power
  const isRide =
    activity.type === "Ride" ||
    activity.sport_type === "Ride" ||
    activity.type === "VirtualRide";
  if (isRide && activity.average_watts > 0) {
    const streamRes = await fetch(
      `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=watts,heartrate,cadence&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (streamRes.ok) {
      const stream = await streamRes.json();
      if (stream.watts?.data) {
        const rideStream: RideStream = {
          activityId,
          date: activity.start_date_local,
          name: activity.name,
          watts: stream.watts.data,
          heartrate: stream.heartrate?.data ?? null,
          cadence: stream.cadence?.data ?? null,
        };

        const existingStreams: RideStream[] =
          (await readCache("ride-streams")) || [];
        existingStreams.unshift(rideStream);
        await writeCache("ride-streams", existingStreams);
      }
    }
  }

  // Store full ride detail (GPS, geo streams, segments) for maps/analysis
  if (isRide) {
    try {
      const detail = await fetchRideDetail(activityId, token, activity);
      if (detail) {
        const details: RideDetail[] = (await readCache("ride-details")) || [];
        const idx = details.findIndex((d) => d.activityId === activityId);
        if (idx >= 0) details[idx] = detail;
        else details.unshift(detail);
        await writeCache("ride-details", details);
        console.log("[WEBHOOK] Ride detail stored, total:", details.length);
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

  // Update in stored activities (remove all duplicates, then insert)
  const activities: any[] = (await readCache("activities")) || [];
  const filtered = activities.filter((a: any) => a.id !== activityId);
  filtered.unshift(activity);
  await writeCache("activities", filtered);
  console.log("[WEBHOOK] Activity updated in cache, total:", filtered.length);
}

async function handleActivityDelete(activityId: number) {
  // Remove from stored activities
  const activities: any[] = (await readCache("activities")) || [];
  const filtered = activities.filter((a: any) => a.id !== activityId);
  await writeCache("activities", filtered);

  // Remove from stored streams
  const streams: RideStream[] = (await readCache("ride-streams")) || [];
  const filteredStreams = streams.filter((s) => s.activityId !== activityId);
  await writeCache("ride-streams", filteredStreams);

  // Remove from stored ride details
  const details: RideDetail[] = (await readCache("ride-details")) || [];
  const filteredDetails = details.filter((d) => d.activityId !== activityId);
  await writeCache("ride-details", filteredDetails);
}
