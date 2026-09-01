"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

const spec = {
  openapi: "3.0.0",
  info: {
    title: "Strava API",
    description:
      "Personal Strava data API with blob-cached responses. Webhook-driven activity, stream, and ride-detail capture; daily sync of athlete profile, zones, stats, and starred segments.",
    version: "1.1.0",
  },
  servers: [
    { url: "https://api.tiggenilsson.se", description: "Production" },
    { url: "http://localhost:3000", description: "Local" },
  ],
  paths: {
    "/api/athlete": {
      get: {
        summary: "Get athlete profile",
        description: "Returns cached athlete profile (incl. FTP, weight, bikes).",
        tags: ["Data"],
        responses: {
          "200": { description: "Athlete profile" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/athlete-zones": {
      get: {
        summary: "Get athlete zones",
        description: "Returns cached heart rate and power zone configuration.",
        tags: ["Data"],
        responses: {
          "200": { description: "Zone configuration" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/stats": {
      get: {
        summary: "Get athlete stats",
        description: "Returns YTD, all-time, and recent ride totals.",
        tags: ["Data"],
        responses: {
          "200": { description: "Athlete statistics" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/activities": {
      get: {
        summary: "Get activities",
        description: "Returns cached activity summaries.",
        tags: ["Data"],
        responses: {
          "200": { description: "List of activities" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/ride-streams": {
      get: {
        summary: "Get ride streams",
        description:
          "Per-ride watts/heartrate/cadence streams used for power records and curves.",
        tags: ["Data"],
        responses: {
          "200": { description: "List of ride streams" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/ride-details": {
      get: {
        summary: "Get full ride details",
        description:
          "Rich per-ride data for maps and analysis: GPS (latlng), altitude, distance, velocity and grade streams, map polylines, and segment efforts. Populate via /api/backfill-rides.",
        tags: ["Data"],
        responses: {
          "200": { description: "List of ride details" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/starred-segments": {
      get: {
        summary: "Get starred segments",
        description:
          "The athlete's starred (favorite) segments. Link to per-ride efforts via segment id. Refreshed daily and on demand via /api/sync-segments.",
        tags: ["Data"],
        responses: {
          "200": { description: "List of starred segments" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/sync-athlete": {
      get: {
        summary: "Sync athlete + segments from Strava",
        description:
          "Fetches athlete profile, zones, stats, and starred segments from Strava and writes them to the blob cache. Runs daily via cron (02:00), or trigger manually.",
        tags: ["Sync"],
        responses: {
          "200": { description: "Sync result" },
          "500": { description: "Sync failed" },
        },
      },
    },
    "/api/sync-segments": {
      get: {
        summary: "Sync starred segments from Strava",
        description:
          "On-demand refresh of starred segments only. Useful after re-starring segments without waiting for the daily cron.",
        tags: ["Sync"],
        responses: {
          "200": { description: "Sync result" },
          "500": { description: "Sync failed" },
        },
      },
    },
    "/api/backfill-rides": {
      get: {
        summary: "Backfill full ride details",
        description:
          "Batched (20 rides/call), resumable, idempotent backfill of full ride data (GPS, geo streams, segment efforts) into the ride-details cache. Skips already-processed rides. Call repeatedly until 'remaining' is 0. Stops gracefully on Strava rate limiting (rateLimited: true) — wait ~15 min and call again.",
        tags: ["Sync"],
        responses: {
          "200": {
            description:
              "Batch progress: { processed, remaining, total, stored, rateLimited }",
          },
          "400": { description: "No activities stored — run initial sync first" },
          "500": { description: "Backfill failed" },
        },
      },
    },
    "/api/webhook": {
      get: {
        summary: "Webhook verification",
        description: "Strava webhook subscription verification handshake.",
        tags: ["Webhook"],
        responses: {
          "200": { description: "Challenge response" },
          "403": { description: "Invalid verify token" },
        },
      },
      post: {
        summary: "Webhook event",
        description:
          "Receives Strava events. On activity create: stores the activity, generates an AI description, captures power streams and full ride details. On activity update/delete: keeps caches in sync. On athlete update: re-syncs athlete data.",
        tags: ["Webhook"],
        responses: { "200": { description: "Event processed" } },
      },
    },
  },
};

export default function SwaggerPage() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <SwaggerUI spec={spec} />
    </div>
  );
}
