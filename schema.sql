-- Strava API cache schema (Supabase Postgres)
-- Replaces monolithic Vercel Blob JSON files with per-row storage so a
-- single new/updated ride no longer requires reading+writing the entire
-- history.

-- Small singleton payloads: athlete, athlete-zones, stats, starred-segments.
CREATE TABLE IF NOT EXISTS kv_cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per Strava activity (replaces the single "activities" array blob).
CREATE TABLE IF NOT EXISTS activities (
  id bigint PRIMARY KEY,
  start_date timestamptz,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_start_date_idx
  ON activities (start_date DESC);

-- One row per ride, including GPS/geo streams + segment efforts
-- (replaces the single "ride-details" array blob, previously ~150MB).
CREATE TABLE IF NOT EXISTS ride_details (
  activity_id bigint PRIMARY KEY,
  date timestamptz,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_details_date_idx
  ON ride_details (date DESC);

-- One row per ride, watts/heartrate/cadence streams
-- (replaces the single "ride-streams" array blob).
-- `summary` holds a small precomputed aggregate (best-effort power curve,
-- zone-time, cadence histogram, etc.) so dashboard charts never need to
-- download the raw per-second `data` payload.
CREATE TABLE IF NOT EXISTS ride_streams (
  activity_id bigint PRIMARY KEY,
  date timestamptz,
  data jsonb NOT NULL,
  summary jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_streams_date_idx
  ON ride_streams (date DESC);
ALTER TABLE ride_streams ADD COLUMN IF NOT EXISTS summary jsonb;
