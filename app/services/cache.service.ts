import { put, list, del } from "@vercel/blob";

const BLOB_PREFIX = "strava-cache/";
const token = process.env.STRAVA_CACHE_READ_WRITE_TOKEN!;

export async function writeCache(key: string, data: unknown): Promise<void> {
  await put(`${BLOB_PREFIX}${key}.json`, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    token,
  });
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const { blobs } = await list({ prefix: `${BLOB_PREFIX}${key}.json`, token });
    if (blobs.length === 0) return null;

    const response = await fetch(blobs[0].url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  const { blobs } = await list({ prefix: BLOB_PREFIX, token });
  for (const blob of blobs) {
    await del(blob.url, { token });
  }
}
