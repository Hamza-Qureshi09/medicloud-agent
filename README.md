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

## Slave setup through the dashboard

Set `AGENT_MODE=slave` for the initial build or source launch. Master credentials
are optional at startup. Open `/dashboard/` and choose Master Connection. Enter
the master hostname/IP, port, slave ID, and secret issued by the master, then
choose Save and Connect. Successful verification starts synchronization without
rebuilding or restarting the executable.

The connection is saved as `slave-connection.json` beside the agent database and
loaded automatically on subsequent starts. Saved settings override legacy slave
connection values in the environment. The API never returns the saved secret.
Keep this file and the agent databases protected and use a stable launch/data
directory. Existing environment-based slave installations remain supported.

## Dashboard refresh settings

Copy `frontend/.env.example` to `frontend/.env` when setting up a checkout.
The intervals are in milliseconds and must be integers of at least 1000.

```dotenv
VITE_MASTER_CONNECTION_POLL_INTERVAL_MS=10000
VITE_LIVE_RESOURCE_POLL_INTERVAL_MS=10000
```

The first refreshes saved master connection status. The second refreshes live
machine, slave, and order information. These browser refreshes do not control
agent heartbeats or order synchronization. Those are backend workers and use
their environment settings and the intervals returned by the upstream server.

The Add Master Connection form gets its initial port from backend `MASTER_PORT`.
The saved connection port overrides that initial value after configuration.

Vite embeds frontend environment settings during the build. Restart Vite after
editing them during development. For an executable, run `npm run build` inside
`frontend/`, then run the appropriate `deno task compile:agent:*` task from the
agent folder to embed the rebuilt dashboard.


Catalogs, drivers, and other configuration resources refresh on focus,
reconnection, or manual refresh. Only operational queries opt into the shared
live refresh policy. Polling pauses in hidden or offline browser windows.

## Connection lifecycle and analyzer information

The master issues a slave ID and secret in Manage Slaves. On the slave, use
Master Connection and Add Master Connection to enter a slave name, master host,
port, ID, and secret. The name is included in slave heartbeats and shown by the
master. Existing unnamed installations keep their previous fallback label.

The slave initiates all synchronization requests. It sends heartbeats and
machine catalogs, pulls leased orders, acknowledges work, reports status, and
uploads results. The master answers those requests and does not call the slave.
Browser refresh intervals only update the dashboard. The heartbeat worker runs
independently with one request at a time, upstream timing hints, bounded failure
backoff, and jitter. Order pulling is also sequential and uses upstream delays.

Each slave accepts one saved master connection. A successful verification closes
the form and shows the connection card. The Add button stays disabled while a
connection exists. Delete stops synchronization and removes the credentials.
It leaves a small disconnected record in `slave-connection.json`, so embedded
legacy environment credentials cannot restore the deleted connection on restart.
Local orders and results remain intact. The previous identity is retained to
prevent synchronized work from being sent under a different master or slave ID.
Reconnect to the same identity, or use a separate data directory for a new one.

Connected means the most recent heartbeat succeeded within the active window.
The badge becomes Disconnected after failure or a stale heartbeat. A disconnected
network connection is retried automatically while its settings remain saved.

Order lists, order details, and the overview display learned analyzer timing.
The first order has no estimate. Completed orders teach timing per analyzer
profile and test. Later orders use that history, with an expected finish once
the analyzer accepts the order. Driver fallback durations do not become learned
estimates. A test batch uses the longest learned average and remains unknown if
any requested test has no history. Estimates are not completion guarantees.

Catalogs display both names and codes. Bonavera numeric identifiers, including
code `0`, remain unchanged for ordering and result mapping. MediCloud static
mapping selectors offer only running and connected machines reported by active
agents with fresh heartbeats. The main app uses page, focus,
and manual refresh. It calculates status from the last two minutes of heartbeat
data without API polling or heartbeat expiry timers.


The local agent dashboard keeps one shared connection-status query in its
machine provider. The setup notice and Master Connection page consume that
query rather than starting separate refresh schedules. Registry request errors
are handled independently from agent-info errors. Detail pages do not display
previous query data while a different record is loading. Paginated live lists
retain their rows during a refresh.


## Focused review and shared helpers

See [Review and refactor report](REVIEW_AND_REFACTOR_REPORT.md) for the changes,
regression checks, browser verification, and remaining validation boundaries.

The delivery worker delegates machine-result correlation and result queue inserts
to `db/repositories/resultQueue.ts`. The order pull worker shares its guarded
acknowledgement transition through `db/repositories/orderAcknowledgements.ts`.

In the dashboard, `lib/api.ts` describes endpoints and `lib/http.ts` executes
requests. `lib/api-url.ts` handles same-origin and configured API URLs. The order
form's catalog picker and pure helpers live in `pages/orders/orderForm/`, with
shared test-code parsing in `lib/order-tests.ts`.
