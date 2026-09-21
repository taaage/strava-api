import { getActivities } from "@/app/services/db.service";
import { NextResponse } from "next/server";
import { options } from "../helpers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const OPTIONS = options;

export async function GET() {
  const activities = await getActivities();
  return NextResponse.json(activities, {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" },
  });
}
