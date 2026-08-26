# Strava API

Backend for the Strava cycling dashboard. Webhook-driven — all data sync happens automatically when Strava pushes events. No polling or cron jobs.

## Architecture

```
app/
├── api/
│   ├── webhook/          # Strava webhook (handles all events)
│   ├── athlete/          # GET — cached athlete profile
│   ├── activities/       # GET — cached activities
│   ├── stats/            # GET — cached athlete stats
│   ├── power-records/    # GET — cached best power efforts
│   ├── zones/            # GET — cached zone distribution
│   ├── ride-streams/     # GET — cached ride streams (watts/hr/cadence)
│   └── helpers.ts        # CORS + cached route helper
├── services/
│   ├── sync/
│   │   ├── athlete.sync.ts    # Fetch athlete profile, zones, stats
│   │   ├── activities.sync.ts # Activity list fetching
│   │   ├── power.sync.ts      # Power records from streams
│   │   ├── streams.sync.ts    # Raw stream storage
│   │   ├── zones.sync.ts      # Zone distribution mapping
│   │   └── index.ts           # Re-exports
│   ├── power.utils.ts         # Best effort computation, zone helpers
│   ├── strava.service.ts      # Auth (token refresh) + Strava API helpers
│   ├── ai.service.ts          # Gemini AI description generation
│   └── cache.service.ts       # Vercel Blob read/write
└── config/
    └── constants.ts            # API URLs
```

## How it works

### Webhook events

| Event | Action | Strava API calls |
|-------|--------|-----------------|
| `activity.create` | Fetch activity + stream, store in blob, generate AI description | 3 |
| `activity.update` | Re-fetch activity, update blob | 1 |
| `activity.delete` | Remove from blobs | 0 |
| `athlete.update` | Re-fetch profile, zones, stats | 3 |

### Data storage

All data is cached in Vercel Blob. The API routes serve cached data directly — no Strava calls on read.

| Blob key | Contents |
|----------|----------|
| `athlete` | Athlete profile (incl. FTP, weight, bikes) |
| `athlete-zones` | Power + HR zone boundaries from Strava settings |
| `stats` | Ride totals (recent, YTD, all-time) |
| `activities` | Full activity list (~700 rides) |
| `power-records` | Best efforts at 14 durations (last 20 rides) |
| `zones` | Time-in-zone distribution (last 20 rides) |
| `ride-streams` | Per-ride streams: watts[], heartrate[], cadence[] |

## Setup

### 1. Create Strava API Application

1. Go to https://www.strava.com/settings/api
2. Create a new app
3. Set **Authorization Callback Domain** to your deployment domain

### 2. Get Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Create API Key

### 3. Environment Variables

```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
STRAVA_VERIFY_TOKEN=
STRAVA_CACHE_READ_WRITE_TOKEN=
GEMINI_API_KEY=
```

### 4. Deploy

```bash
npx vercel --prod
```

### 5. Subscribe to Strava Webhooks

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://your-app.vercel.app/api/webhook \
  -F verify_token=YOUR_VERIFY_TOKEN
```

## Tech Stack

- Next.js API Routes (Vercel)
- Vercel Blob (storage)
- Strava API (webhook-driven)
- Google Gemini (AI descriptions)
