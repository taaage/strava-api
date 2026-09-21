# Strava API

Backend for the Strava cycling dashboard. Webhook-driven — all data sync happens automatically when Strava pushes events. No polling or cron jobs.

## Architecture

```
app/
├── api/
│   ├── webhook/          # Strava webhook (handles all events)
│   ├── athlete/          # GET — cached athlete profile
│   ├── athlete-zones/    # GET — cached HR/power zone boundaries
│   ├── activities/       # GET — cached activities
│   ├── stats/            # GET — cached athlete stats
│   ├── ride-details/     # GET — ride list metadata; GET [id] — single ride detail + streams
│   ├── ride-streams/     # GET — precomputed per-ride power/HR/cadence summaries
│   ├── starred-segments/ # GET — cached starred segments
│   ├── sync-athlete/     # GET — manual athlete + segments sync
│   ├── sync-segments/    # GET — manual starred segments sync
│   ├── backfill-rides/   # GET — resumable backfill of ride-details + ride-streams from Strava
│   └── helpers.ts        # CORS + cached route helper
├── services/
│   ├── athlete.sync.ts         # Fetch athlete profile, zones, stats
│   ├── segments.sync.ts        # Starred segments fetching
│   ├── ride-detail.service.ts  # Full ride detail + geo/power/HR/cadence stream fetching
│   ├── stream-summary.service.ts # Precomputes best-efforts, zone-time, cadence histogram per ride
│   ├── strava.service.ts       # Auth (token refresh) + Strava API helpers
│   ├── ai.service.ts           # Gemini AI description generation
│   └── db.service.ts           # Supabase Postgres read/write helpers
└── config/
    └── constants.ts            # API URLs
```

## How it works

### Webhook events

| Event | Action | Strava API calls |
|-------|--------|-----------------|
| `activity.create` | Fetch activity + merged geo/power/HR/cadence streams, store, generate AI description | 2 |
| `activity.update` | Re-fetch activity, update row | 1 |
| `activity.delete` | Remove rows | 0 |
| `athlete.update` | Re-fetch profile, zones, stats | 3 |

### Data storage

All data is cached in Supabase Postgres. The API routes serve cached data directly — no Strava calls on read.

Large per-ride payloads (`ride_details`, `ride_streams`) are stored **one row per ride**, so adding or updating a single ride only reads/writes that row — not the entire history.

| Table / key | Contents |
|----------|----------|
| `kv_cache.athlete` | Athlete profile (incl. FTP, weight, bikes) |
| `kv_cache.athlete-zones` | Power + HR zone boundaries from Strava settings |
| `kv_cache.stats` | Ride totals (recent, YTD, all-time) |
| `kv_cache.starred-segments` | Starred segments |
| `activities` | One row per activity (full activity list, ~700 rides) |
| `ride_details` | One row per ride: GPS/geo streams + segment efforts |
| `ride_streams` | One row per ride: raw watts[]/heartrate[]/cadence[] (`data`, kept for recompute) + a precomputed `summary` (best-efforts, avg watts/HR, cadence histogram, zone-seconds) |

`GET /api/ride-details` returns lightweight metadata only (no streams) for list views. Fetch a single ride's full detail (incl. geo streams) via `GET /api/ride-details/{id}`.

`GET /api/ride-streams` returns only the precomputed `summary` for every ride — the dashboard's Power/Zones/Streams charts never download raw per-second arrays. If athlete zones or FTP change, the summaries can be recomputed from the retained raw `data` without re-fetching from Strava (see `recomputeAllStreamSummaries` in `db.service.ts`).

## Setup

### 1. Create Strava API Application

1. Go to https://www.strava.com/settings/api
2. Create a new app
3. Set **Authorization Callback Domain** to your deployment domain

### 2. Create a Supabase Project

1. Go to https://supabase.com/dashboard → New Project
2. Once provisioned, go to **Project Settings → Database → Connection string** and copy the **Transaction pooler** string (port `6543`)

### 3. Get Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Create API Key

### 4. Environment Variables

```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
STRAVA_VERIFY_TOKEN=
DATABASE_URL=
GEMINI_API_KEY=
```

### 5. Apply the database schema

```bash
npm run db:migrate
```

### 6. Deploy

```bash
npx vercel --prod
```

### 7. Subscribe to Strava Webhooks

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://your-app.vercel.app/api/webhook \
  -F verify_token=YOUR_VERIFY_TOKEN
```

## Tech Stack

- Next.js API Routes (Vercel)
- Supabase Postgres (storage)
- Strava API (webhook-driven)
- Google Gemini (AI descriptions)
