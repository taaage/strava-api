import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://strava.tiggenilsson.se",
  "https://tiggenilsson.se",
  "http://localhost:5173",
  "http://localhost:3000",
];

export function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function corsResponse(data: unknown, origin: string | null, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(origin),
  });
}

export function optionsResponse(origin: string | null) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
