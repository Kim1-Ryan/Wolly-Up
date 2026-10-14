import "dotenv/config";
import pg from "pg";
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Add it to the local .env file.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.DATABASE_PROVIDER === 'supabase' ? {
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(resolve('supabase/prod-ca-2021.crt'), 'utf8')
    }
  } : {}),
  max: process.env.NETLIFY ? 2 : 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true
});
