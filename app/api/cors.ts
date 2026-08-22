import { NextResponse } from "next/server";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function corsResponse(data: unknown, origin: string | null, status = 200, cacheMaxAge = 0) {
  const headers: Record<string, string> = corsHeaders();

  // Only cache successful responses
  if (cacheMaxAge > 0 && status >= 200 && status < 300) {
    headers["Cache-Control"] = `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}, stale-while-revalidate=${cacheMaxAge * 2}`;
  } else if (status >= 400) {
    headers["Cache-Control"] = "no-store";
  }

  return NextResponse.json(data, { status, headers });
}

export function optionsResponse(origin: string | null) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}
