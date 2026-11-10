# 2. Install, run and build

## Prerequisites

- Deno 2.x. The review used 2.9.8. `deno.lock` pins the dependencies.
- The sibling folder `../medicloud-agent-sdk`. `deno.json` maps
  `@mediCloud/sdk/manager` to `../medicloud-agent-sdk/machineManager.ts`, so
  both folders must sit side by side.
- Only to rebuild the dashboard: Node.js and npm (see [dashboard](10-dashboard.md)).
- For **serial** analyzers: Node.js on the lab PC. The SDK starts
  `node node-serial.mjs` to own the COM port. See
  [KNOWN_ISSUES H5](KNOWN_ISSUES.md#h5-serial-analyzers-probably-cannot-start-from-the-compiled-exe)
  for the problem this causes in the compiled exe.

## Run from source

```powershell
copy .env.example .env
deno task dev            # deno run --watch-hmr --sloppy-imports --env-file=.env -A main.ts
```

At startup the agent creates the database folder and applies all migrations
([db/index.ts](../../db/index.ts)). You do not need to run a separate
migration step. `deno task db:migrate` ([db/migrate.ts](../../db/migrate.ts))
exists if you want to migrate without starting the agent.

## All `deno` tasks ([deno.json](../../deno.json))

| Task | What it does |
| --- | --- |
| `dev` | Run `main.ts` with hot reload and `.env` |
| `check` | Type-check `main.ts` |
| `lint` | Lint backend folders (`frontend`, `drizzle` and `data` are excluded) |
| `test` | Run `tests/` (see [testing](12-testing.md)) |
| `db:generate` | `drizzle-kit generate`: create a migration from changes to `db/tables/*.ts` |
| `db:migrate` | Apply migrations only |
| `compile:agent:win` | Build `binaries/lis-middleware.exe` (Windows x64) |
| `compile:agent:linux:x64/arm64`, `compile:agent:mac:x64/arm64` | Same for other targets |
| `desktop:agent:*` | `deno desktop` build (webview window). Same includes. Status unclear: no docs or tests cover it. |

## Compiling the exe

```powershell
cd frontend; npm ci; npm run build; cd ..     # only if the dashboard changed
deno task compile:agent:win
```

How the build works:

- `deno.json` → `compile.include` embeds `./drizzle` (migrations) and
  `./frontend/build` (dashboard). Both are found at runtime through
  `import.meta.url`, so they work inside the exe.
- `compile.permissions.all = true`, so the exe runs with all permissions.
- `--env-file=.env` **embeds your local `.env`** into the exe. Build on a
  machine whose `.env` holds the right site's values, or see
  [KNOWN_ISSUES M9](KNOWN_ISSUES.md#m9-the-compile-tasks-embed-the-developer-env-secrets-included).
  The code does not show whether real environment variables override the
  embedded ones at runtime. Test this on your Deno version before you rely
  on it.
- The SDK's serial helper `node-serial.mjs` is **not** embedded.

## The `binaries/` and `data/` folders

```
medicloud-agent/
├─ binaries/
│   ├─ lis-middleware.exe        # compiled agent (git-ignored)
│   └─ data/                     # data dir when the exe is started from binaries/
└─ data/                         # data dir when running from source
    ├─ agent.db (+ -wal, -shm)   # agent database (WAL mode)
    ├─ machines.db               # SDK database
    ├─ agent-instance-id         # UUID created on first start
    └─ slave-connection.json     # slave mode only
```

**Important:** all default paths are relative to the **current working
directory**, not to the exe. Start the exe from its own folder, or use
absolute paths in the env.
`agent-instance-id` is always written to `./data/` in the working directory,
even if you move the databases
([KNOWN_ISSUES M8](KNOWN_ISSUES.md#m8-data-paths-depend-on-the-working-directory-and-the-instance-id-path-ignores-the-db-setting)).
Never copy a `data/` folder from one lab PC to another. The instance id and
the slave identity would be cloned
([KNOWN_ISSUES M7](KNOWN_ISSUES.md#m7-a-duplicate-slave-instanceid-makes-heartbeats-fail-with-500)).

## Environment variables

[schemas/env.ts](../../schemas/env.ts) parses these when
[lib/env.ts](../../lib/env.ts) is first imported. An empty value counts as
"not set". Numbers must be positive integers. Booleans accept
`true/1/yes/false/0/no`. If parsing fails, the process stops at once with a
Zod error.

| Variable | Default | Used by | Meaning |
| --- | --- | --- | --- |
| `AGENT_MODE` | `direct` | everywhere | `direct`, `master` or `slave` (lower case only). See [modes](03-modes-and-topology.md). |
| `MEDICLOUD_AGENT_HTTP_HOST` | `0.0.0.0` (`.env.example` sets `127.0.0.1`) | `main.ts` `Deno.serve` | Address to listen on. Use `127.0.0.1` for direct and slave. A master must use a LAN address or `0.0.0.0` so slaves can reach it. The dashboard has no login ([H4](KNOWN_ISSUES.md#h4-dashboard-and-sdk-api-have-no-auth-use-cors-and-bind-to-0000-by-default)). |
| `MEDICLOUD_AGENT_HTTP_PORT` | `5001` | `main.ts` | HTTP port for the dashboard, the SDK API and `/slave-sync`. |
| `MEDICLOUD_AGENT_DB_PATH` | `./data/agent.db` | `db/path.ts` | Agent SQLite file. `slave-connection.json` is stored in the same folder. |
| `MEDICLOUD_MACHINES_SDK_DB_PATH` | `./data/machines.db` | `main.ts` → `MachineManager({dbPath})` | SDK SQLite file. |
| `MEDICLOUD_API_URL` | (empty) | `flow/sync/client.ts` | MediCloud origin, **without** `/api`. The agent adds `/api/agent-sync/...`. Required in direct and master modes. |
| `MEDICLOUD_AGENT_ID` | (empty) | sync client | Registration id (a MongoDB ObjectId) from MediCloud. Sent as `x-agent-id`. Required in direct and master. |
| `MEDICLOUD_AGENT_SECRET` | (empty) | sync client | Registration secret. Sent as `x-agent-secret`. Required in direct and master. |
| `MEDICLOUD_ACCOUNT_ID` | (empty) | `validateEnvironment()` only | Required in direct and master, but **no other code reads it**. |
| `MEDICLOUD_PING_INTERVAL_MS` | `30000` | `HeartbeatWorker` | Heartbeat interval before the first answer and the base for failure backoff. After a success, the server's `heartbeatAfterMs` wins. On a master it is also the `heartbeatAfterMs` given to slaves. |
| `DEFAULT_ORDER_PULL_INTERVAL_MS` | `10000` | `OrderPullWorker` | Pull interval when the server gives none. On a master it is also the `pullAfterMs` given to slaves. |
| `MASTER_HOST` | (empty) | slave mode | Old-style fallback master address. Used only if `slave-connection.json` does not exist. |
| `MASTER_PORT` | `5001` | slave mode | Fallback master port. Also the default port shown in the dashboard form. |
| `SLAVE_ID` | (empty) | slave mode | Fallback slave id. |
| `SLAVE_SECRET` | (empty) | slave mode | Fallback slave secret. |
| `SERIAL_TRACE` | `false` | SDK (reads env itself) | Turns on serial byte tracing in the SDK. The agent parses it but never reads it. |
| `MEDICLOUD_MACHINES_INTERNAL_HTTP_ENABLED` | `false` | nothing | Parsed but unused ([L7](KNOWN_ISSUES.md#l7-medicloud_machines_internal_http_enabled-does-nothing)). |

`validateEnvironment()` ([lib/env.ts](../../lib/env.ts)) checks that the four
`MEDICLOUD_*` identity values are present in direct and master modes. Slave
mode skips this check.

`env.AGENT_LOCAL_URL` is derived as `http://<host>:<port>`. When the host is
`0.0.0.0` or `::`, it uses `127.0.0.1` instead. The agent uses this URL to
call **its own** server for SDK data ([lib/api.ts](../../lib/api.ts)).

Frontend variables (`VITE_*`) are covered in [dashboard](10-dashboard.md).
