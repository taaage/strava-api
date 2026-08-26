import { readCache } from "@/app/services/cache.service";
import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function options() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function cachedRoute(key: string, maxAge = 300) {
  const data = await readCache(key);
  if (!data) {
    return NextResponse.json(
      { error: "No cached data. Run /api/sync first." },
      { status: 404, headers: CORS_HEADERS },
    );
  }
  return NextResponse.json(data, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}
