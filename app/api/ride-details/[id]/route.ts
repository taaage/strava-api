import { getRideDetail } from "@/app/services/db.service";
import { NextResponse } from "next/server";
import { options } from "../../helpers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const OPTIONS = options;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) {
    return NextResponse.json(
      { error: "Invalid activity id" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const ride = await getRideDetail(activityId);
  if (!ride) {
    return NextResponse.json(
      { error: "No detailed data for this ride." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(ride, {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=1800" },
  });
}
