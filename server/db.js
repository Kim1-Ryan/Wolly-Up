import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Add it to the local .env file.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.NETLIFY ? 2 : 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true
});
