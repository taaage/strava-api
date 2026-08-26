import { STRAVA_API_BASE } from "@/app/config/constants";
import { generateDescription } from "@/app/services/ai.service";
import { readCache, writeCache } from "@/app/services/cache.service";
import {
  getActivity,
  refreshAccessToken,
  updateActivityDescription,
} from "@/app/services/strava.service";
import { syncAthlete } from "@/app/services/athlete.sync";
import type { RideStream } from "@/app/services/types";
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
    const token = await refreshAccessToken();
    if (!token)
      return NextResponse.json({ error: "No token" }, { status: 500 });

    if (event.object_type === "activity") {
      await handleActivityEvent(event, token);
    } else if (
      event.object_type === "athlete" &&
      event.aspect_type === "update"
    ) {
      await syncAthlete(token);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
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
  const activity = await getActivity(activityId, token);

  // Generate and set AI description
  const description = await generateDescription(activity);
  await updateActivityDescription(activityId, token, description);

  // Append to stored activities
  const activities: any[] = (await readCache("activities")) || [];
  activities.unshift(activity);
  await writeCache("activities", activities);

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
}

async function handleActivityUpdate(activityId: number, token: string) {
  const activity = await getActivity(activityId, token);

  // Update in stored activities
  const activities: any[] = (await readCache("activities")) || [];
  const index = activities.findIndex((a: any) => a.id === activityId);
  if (index >= 0) {
    activities[index] = activity;
  } else {
    activities.unshift(activity);
  }
  await writeCache("activities", activities);
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
}
