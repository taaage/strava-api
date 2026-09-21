// One-off schema setup script. Run with `npm run db:migrate`.
// Reads DATABASE_URL from the environment (.env via dotenv) and applies
// schema.sql idempotently (CREATE TABLE IF NOT EXISTS).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set (check strava-api/.env)");
    process.exit(1);
  }

  const sql = readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(sql);
    console.log("Schema applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
