import { getRideStreamSummaries } from "@/app/services/db.service";
import { NextResponse } from "next/server";
import { options } from "../helpers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const OPTIONS = options;

export async function GET() {
  const summaries = await getRideStreamSummaries();
  return NextResponse.json(summaries, {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=1800" },
  });
}
