# Wolly Up

## Local development

1. Install dependencies with `npm install`.
2. Set `DATABASE_URL` in the root `.env` file to your PostgreSQL connection string.
3. For a new database, apply `server/schema.sql` before starting the app.
4. Run `npm run dev` to start both the API and Vite, then open the URL printed in the terminal.

The API uses port 3002 by default. Set `PORT` in `.env` to change it; Vite's `/api` proxy uses the same setting. Stop both services with Ctrl+C. API code changes automatically restart the server; restart the command after changing environment settings.

To run the services in separate terminals, use `npm run api:dev` and `npm run dev:client` instead.

## Login troubleshooting

`ECONNREFUSED` for `/api/auth/login` means Vite cannot reach the API. Start both services with `npm run dev`, or start the API separately with `npm run api` if Vite is already running. Check the API terminal for database startup errors.

Visit `/api/health` through the Vite URL to check the proxy and database connection. A successful response includes `connected: true`.

## Checks

- `npm run build` builds the frontend.
- `npm run lint` runs ESLint.

## Full app hosting

GitHub Pages serves the frontend only. To run login, bookings and messages, deploy the Node server and PostgreSQL database as well.

[Deploy the full app on Render](https://render.com/deploy?repo=https://github.com/Kim1-Ryan/Wolly-Up)

The included `render.yaml` provisions a free web service and a free PostgreSQL database. Render's free database expires after 30 days; use a persistent database plan before relying on it for ongoing data. The server initializes the database schema automatically and serves the built frontend at its Render URL. A newly created database has no accounts: register a new account, or migrate the local database to preserve existing accounts and bookings. Never commit `.env` or database backups.

To retain the GitHub Pages address, set the repository Actions variable `VITE_API_URL` to the Render service URL (without `/api`), then rerun the Pages workflow. `FRONTEND_ORIGINS` on the API allows the GitHub Pages origin. Local development continues to use Vite's existing API proxy.
