# MediCloud agent

This folder is a separate Deno agent project. `medicloud-agent` is the behavior
reference. The machine SDK is imported through the mappings in `deno.json`.

## Layout

- `schemas/` holds Zod schemas for environment settings, dashboard requests,
  sync requests, and shared fields. Types derived from those schemas are
  exported there and through `types.ts` where needed.
- `lib/` holds API calls, environment loading, constants, errors, and shared
  helpers.
- `db/tables/` holds one Drizzle table per file. Each field has a purpose
  comment. `db/repositories/` contains dashboard queries, and `drizzle/`
  contains the existing migration history.
- `flow/` creates the agent workers and provides machine capability and slave
  registry services.
- `jobs/` contains the heartbeat, order pull, and result delivery workers.
- `routes/dashboard/` and `routes/slaveSync/` contain the HTTP handlers. The
  parent route files register them.
- `frontend/` contains the dashboard source and prebuilt assets served at
  `/dashboard`.

## Run

Copy `.env.example` to `.env` and set credentials for the selected `AGENT_MODE`.
Use `deno task dev` to start the agent. The agent creates the SQLite parent
directory and applies migrations at startup.

Run `deno task check`, `deno task lint`, and `deno task test` before changing
backend code. Use `deno task db:generate` after an intentional table change. The
existing migrations are retained so databases from the working agent remain
compatible.

The dashboard can be rebuilt from `frontend/` with `npm ci` and `npm run build`.
Its default API base URL is the same origin as the dashboard.
