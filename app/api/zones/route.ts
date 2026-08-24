import { NextRequest } from "next/server";
import { readCache } from "@/app/services/cache.service";
import { corsResponse, optionsResponse } from "../cors";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const data = await readCache("zones");
  if (!data) return corsResponse({ error: "No cached data. Run /api/sync first." }, origin, 404);
  return corsResponse(data, origin);
}
