import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Reused across warm serverless invocations. Supabase's transaction pooler
// (port 6543) handles connection multiplexing, so a small local pool is fine
// even under bursty webhook/backfill traffic.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    global.__pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return global.__pgPool;
}

export function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

export async function withAdvisoryTransactionLock<T>(
  lockId: number,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);

    const result = await operation(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

// --- Generic small-blob key/value cache -----------------------------------
// Used for singleton payloads that are small and always read/written whole:
// athlete, athlete-zones, stats, starred-segments.

export async function readCache<T>(key: string): Promise<T | null> {
  const { rows } = await query<{ value: T }>(
    "SELECT value FROM kv_cache WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function writeCache(key: string, data: unknown): Promise<void> {
  await query(
    `INSERT INTO kv_cache (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, JSON.stringify(data)],
  );
}

// --- Activities (one row per activity) -------------------------------------

export async function getActivities(): Promise<any[]> {
  const { rows } = await query<{ data: any }>(
    "SELECT data FROM activities ORDER BY start_date DESC NULLS LAST",
  );
  return rows.map((r) => r.data);
}

export async function upsertActivity(activity: any): Promise<void> {
  const startDate = activity.start_date ?? activity.start_date_local ?? null;
  await query(
    `INSERT INTO activities (id, start_date, data, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET start_date = $2, data = $3, updated_at = now()`,
    [activity.id, startDate, JSON.stringify(activity)],
  );
}

export async function deleteActivity(activityId: number): Promise<void> {
  await query("DELETE FROM activities WHERE id = $1", [activityId]);
}

// --- Ride details (one row per activity, includes geo streams) ------------

export async function getRideDetails(): Promise<any[]> {
  const { rows } = await query<{ data: any }>(
    "SELECT data FROM ride_details ORDER BY date DESC NULLS LAST",
  );
  return rows.map((r) => r.data);
}

export async function getRideDetailsIndex(): Promise<any[]> {
  // Lightweight listing without the large streams payload — for list views
  // that only need metadata (id, date, name, map polyline, segment efforts).
  const { rows } = await query<{ data: any }>(
    "SELECT data FROM ride_details ORDER BY date DESC NULLS LAST",
  );
  return rows.map((r) => {
    const { streams, ...rest } = r.data;
    return rest;
  });
}

export async function getRideDetailIds(): Promise<Set<number>> {
  const { rows } = await query<{ activity_id: string }>(
    "SELECT activity_id FROM ride_details",
  );
  return new Set(rows.map((r) => Number(r.activity_id)));
}

export async function getRideDetail(activityId: number): Promise<any | null> {
  const { rows } = await query<{ data: any }>(
    "SELECT data FROM ride_details WHERE activity_id = $1",
    [activityId],
  );
  return rows[0]?.data ?? null;
}

export async function upsertRideDetail(detail: {
  activityId: number;
  date?: string;
}): Promise<void> {
  await query(
    `INSERT INTO ride_details (activity_id, date, data, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (activity_id) DO UPDATE SET date = $2, data = $3, updated_at = now()`,
    [detail.activityId, detail.date ?? null, JSON.stringify(detail)],
  );
}

export async function deleteRideDetail(activityId: number): Promise<void> {
  await query("DELETE FROM ride_details WHERE activity_id = $1", [
    activityId,
  ]);
}

// --- Ride streams (one row per activity, watts/hr/cadence) -----------------
// Dashboard charts consume only the precomputed `summary` (small); the raw
// `data` payload is kept for potential recompute (e.g. after an FTP/zone
// change) and is never served to the frontend in bulk.

export async function getRideStreamSummaries(): Promise<any[]> {
  const { rows } = await query<{ summary: any }>(
    "SELECT summary FROM ride_streams WHERE summary IS NOT NULL ORDER BY date DESC NULLS LAST",
  );
  return rows.map((r) => r.summary);
}

export async function getRideStreamIds(): Promise<Set<number>> {
  const { rows } = await query<{ activity_id: string }>(
    "SELECT activity_id FROM ride_streams",
  );
  return new Set(rows.map((r) => Number(r.activity_id)));
}

export async function upsertRideStream(
  stream: { activityId: number; date?: string },
  summary: unknown,
): Promise<void> {
  await query(
    `INSERT INTO ride_streams (activity_id, date, data, summary, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (activity_id) DO UPDATE
       SET date = $2, data = $3, summary = $4, updated_at = now()`,
    [
      stream.activityId,
      stream.date ?? null,
      JSON.stringify(stream),
      JSON.stringify(summary),
    ],
  );
}

// Recomputes `summary` for every stored ride using the current athlete
// zones. Use this once after an FTP/zone change so historical zone-time
// reflects the new boundaries; the raw per-ride data never has to be
// re-fetched from Strava for this.
export async function recomputeAllStreamSummaries(
  buildSummary: (stream: any, zones: any) => Promise<unknown>,
): Promise<number> {
  const zones = await readCache<any>("athlete-zones");
  const { rows } = await query<{ activity_id: string; data: any }>(
    "SELECT activity_id, data FROM ride_streams",
  );
  for (const row of rows) {
    const summary = await buildSummary(row.data, zones);
    await query("UPDATE ride_streams SET summary = $2 WHERE activity_id = $1", [
      row.activity_id,
      JSON.stringify(summary),
    ]);
  }
  return rows.length;
}

export async function deleteRideStream(activityId: number): Promise<void> {
  await query("DELETE FROM ride_streams WHERE activity_id = $1", [
    activityId,
  ]);
}
