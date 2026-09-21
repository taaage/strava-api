import { getRideDetailsIndex } from "@/app/services/db.service";
import { NextResponse } from "next/server";
import { options } from "../helpers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const OPTIONS = options;

// Returns ride metadata (no GPS/geo streams) for list views. Fetch a single
// ride's full detail (incl. streams) via GET /api/ride-details/[id].
export async function GET() {
  const rides = await getRideDetailsIndex();
  return NextResponse.json(rides, {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=1800" },
  });
}
