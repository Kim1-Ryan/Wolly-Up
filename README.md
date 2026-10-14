# Wolly Up

## Local development

1. Install dependencies with `npm install`.
2. Set `DATABASE_URL` in the root `.env` file to your PostgreSQL connection string.
3. For a new database, apply `server/schema.sql` before starting the app.
4. Run `npm run dev` to start both the API and Vite, then open the URL printed in the terminal.

The API uses port 3002 by default. Set `PORT` in `.env` to change it; Vite's `/api` proxy uses the same setting. Stop both services with Ctrl+C. API code changes automatically restart the server; restart the command after changing environment settings.

To run the services in separate terminals, use `npm run api:dev` and `npm run dev:client` instead.

## Supabase database

The current project is `ealkuxfujxwbpfidshhg` (Wolly Up, Ireland). The app keeps
its existing email/password login and server-side PostgreSQL queries. Set
`DATABASE_PROVIDER=supabase` and a private pooler `DATABASE_URL` in the API host's
environment. The connection URL must omit `sslmode` parameters: the server uses
the bundled Supabase CA certificate and verifies TLS explicitly.

`supabase/migrations/20261014000000_initial_wolly_up.sql` contains the current
application schema and its security restrictions. The GitHub integration's
working directory is `.`, with `main` as the production branch. Free-plan setup
does not require preview branches. Regenerate the initial migration with
`node scripts/export-supabase-schema.js` only before it has been deployed through
GitHub; use new timestamped migrations for subsequent schema changes.

For the initial local migration, `node scripts/connect-supabase.js` reads the
new project's settings from the Git-ignored `.env.supabase.local`, copies the
existing application's tables into an empty target in a transaction, checks
record counts, and switches `.env` after success. It retains the source database
and ignored local backups (`.database-backup.local` and `.env.pgadmin.local`).
Do not commit or publish these files. Restart running services after switching.

## Login troubleshooting

`ECONNREFUSED` for `/api/auth/login` means Vite cannot reach the API. Start both services with `npm run dev`, or start the API separately with `npm run api` if Vite is already running. Check the API terminal for database startup errors.

Visit `/api/health` through the Vite URL to check the proxy and database connection. A successful response includes `connected: true`.

## Checks

- `npm run build` builds the frontend.
- `npm run lint` runs ESLint.

## Full app hosting (free plans)

Use Netlify Free for the frontend and API, and Supabase Free for PostgreSQL. Neon is also compatible. The repository includes netlify.toml and a Netlify Function that runs the API. Free plans have usage limits; do not enable paid upgrades or automatic top-ups.

1. Create a Supabase Free project. Under Connect, copy the transaction pooler PostgreSQL URI (port 6543) with the database password and SSL enabled. Keep this URI private.
2. Import this GitHub repository into Netlify on the Free plan. Build settings come from netlify.toml.
3. Add DATABASE_URL as a secret environment variable for Functions, using the Supabase pooler connection string. Also set DATABASE_PROVIDER=supabase. This enables row-level security and removes public API access to application tables; database access stays server-side. Never commit it to GitHub.
4. Redeploy. The API initializes the database schema automatically. Open /api/health on the Netlify site to verify connectivity.
5. A new database is empty. Register an account, or migrate your local PostgreSQL data to preserve existing accounts and bookings.

The Netlify URL serves the frontend and API together. To keep the GitHub Pages URL, set the GitHub Actions repository variable VITE_API_URL to the Netlify URL (without /api), and add https://kim1-ryan.github.io to the Netlify FRONTEND_ORIGINS environment variable. Then rerun the Pages workflow.

Providers: https://www.netlify.com/pricing/ and https://supabase.com/pricing. Supabase Free includes a 500 MB database and may pause after a week of inactivity. Free-tier quotas apply. Netlify pauses sites at the free limit; do not enable paid upgrades or top-ups.
