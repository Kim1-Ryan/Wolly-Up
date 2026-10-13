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
