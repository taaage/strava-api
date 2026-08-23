import { NextResponse } from "next/server";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function corsResponse(data: unknown, origin: string | null, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

export function optionsResponse(origin: string | null) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}
