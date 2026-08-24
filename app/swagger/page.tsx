"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

const spec = {
  openapi: "3.0.0",
  info: {
    title: "Strava API",
    description:
      "Personal Strava data API with blob-cached responses and daily sync from Strava.",
    version: "1.0.0",
  },
  servers: [
    { url: "https://api.tiggenilsson.se", description: "Production" },
    { url: "http://localhost:3000", description: "Local" },
  ],
  paths: {
    "/api/athlete": {
      get: {
        summary: "Get athlete profile",
        description: "Returns cached athlete profile data.",
        tags: ["Data"],
        responses: {
          "200": { description: "Athlete profile" },
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
        description: "Returns up to 1000 cached activities.",
        tags: ["Data"],
        responses: {
          "200": { description: "List of activities" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/power-records": {
      get: {
        summary: "Get power records",
        description:
          "Best power efforts across durations (5s to 60min) from last 20 rides.",
        tags: ["Data"],
        responses: {
          "200": { description: "Power records by duration" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/zones": {
      get: {
        summary: "Get zone distributions",
        description:
          "Aggregated time-in-zone for power and heart rate from last 20 rides.",
        tags: ["Data"],
        responses: {
          "200": { description: "Zone data" },
          "404": { description: "No cached data" },
        },
      },
    },
    "/api/sync": {
      get: {
        summary: "Sync data from Strava",
        description:
          "Fetches all data from Strava API and writes to blob cache. Runs daily via cron at 5am UTC, or trigger manually.",
        tags: ["Sync"],
        responses: {
          "200": { description: "Sync result" },
          "500": { description: "Sync failed" },
        },
      },
    },
    "/api/webhook": {
      get: {
        summary: "Webhook verification",
        description: "Strava webhook subscription verification.",
        tags: ["Webhook"],
        responses: { "200": { description: "Challenge response" } },
      },
      post: {
        summary: "Webhook event",
        description:
          "Receives Strava activity events and generates AI descriptions.",
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
