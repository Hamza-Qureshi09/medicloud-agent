# 10. Dashboard

The dashboard is a React single-page app served by the agent at `/dashboard/`.
It talks to the agent's own port. Agent routes handle orders, results and
slaves. All other requests go through the catch-all to the SDK.

> **Security:** there is no login, CORS is `*`, and the default bind address
> is `0.0.0.0`. Keep `MEDICLOUD_AGENT_HTTP_HOST=127.0.0.1` unless the agent
> is a master. See
> [KNOWN_ISSUES H4](KNOWN_ISSUES.md#h4-dashboard-and-sdk-api-have-no-auth-use-cors-and-bind-to-0000-by-default).

## Agent HTTP API (backend routes)

Registered in [routes/dashboard.ts](../../routes/dashboard.ts) and
[main.ts](../../main.ts).

| Method and path | File | Modes | Purpose |
| --- | --- | --- | --- |
| `GET /info` | [info.ts](../../routes/dashboard/info.ts) | all | SDK `running_machines` + `registered_drivers`, `mode`, `version` |
| `GET /agent-orders?search&status&limit&offset` | [lists.ts](../../routes/dashboard/lists.ts) | all | Paged inbox (`search` matches `dispatchId`) → `{orders, count}` |
| `POST /agent-orders` | [orders.ts](../../routes/dashboard/orders.ts) | all | Create a **local** order (`LocalOrderCreateSchema`: `machineId`, `sampleId`, `tests?`, `patientId?`, `patientName?`, `sampleType?`, `rackPosition?`, `expiresAt?`). Posts to the SDK first, then inserts an inbox row (`source=local`, `processing`). |
| `PATCH /agent-orders/:id` | orders.ts | all | Edit a local order. Allowed only while the SDK order is `pending`. |
| `DELETE /agent-orders/:id` | orders.ts | all | Delete a local order (SDK order `pending` or `failed`) |
| `POST /agent-orders/:id/reject` (alias `/orders/:id/reject`) | orders.ts | all | Fail an upstream order still in `received` or `acknowledged`, and report `failed` |
| `GET /external-results?search&status&limit&offset` | lists.ts | all | Paged outbox → `{results, count}`. `status` is 0-3. |
| `POST /external-results/reconcile` | [results.ts](../../routes/dashboard/results.ts) | all | Scan SDK results, queue missing ones, flush → `{scanned, queued}` |
| `POST /external-results/:id/retry` | results.ts | all | Reset a non-delivered row to pending and flush. 409 if it was already delivered. |
| `GET /slave-orders`, `GET /slave-results` | lists.ts | master (empty elsewhere) | Inbox and outbox rows with a `targetSlaveId`. Search also matches the slave and instance id. |
| `GET /slaves` | [slaves.ts](../../routes/dashboard/slaves.ts) | all (empty unless master) | `{slaves (no secretHash), totalMachines}` |
| `POST /slaves/register` | slaves.ts | master | `{name?}` → `{slaveId, slaveSecret}` (shown only once) |
| `GET /slaves/:slaveId` | slaves.ts | master | One slave |
| `POST /slaves/:slaveId/inactive` | slaves.ts | master | Set `isActive=false` (see [M5](KNOWN_ISSUES.md#m5-mark-inactive-does-not-stop-a-slave)) |
| `POST /slaves/:slaveId/delete` | slaves.ts | master | Delete the slot (see [M6](KNOWN_ISSUES.md#m6-deleting-a-slave-strands-its-orders)) |
| `GET /slave-connection` | [slaveConnection.ts](../../routes/dashboard/slaveConnection.ts) | slave | Redacted connection status |
| `PUT /slave-connection` | slaveConnection.ts | slave | Save and verify the master connection (same-origin only) |
| `DELETE /slave-connection` | slaveConnection.ts | slave | Disconnect (same-origin only) |
| `GET /dashboard`, `/dashboard/*` | [frontend.ts](../../routes/dashboard/frontend.ts) | all | Static files from `frontend/build/`, with `index.html` as the SPA fallback |
| anything else | SDK handler | all | `/health`, `/drivers`, `/profiles*`, `/orders*`, `/results*`, `/catalogs*`, `/test-statistics*` |
| `POST /slave-sync/*` | see [master ↔ slave](09-master-slave-sync.md) | master | Slave API |

`requireDashboardOrigin` ([routes/middleware/dashboardOrigin.ts](../../routes/middleware/dashboardOrigin.ts))
refuses requests where `Sec-Fetch-Site: cross-site` or where the `Origin`
differs from the request origin. It protects only the slave-connection
changes.

## Frontend structure — `frontend/src`

| Path | Contents |
| --- | --- |
| `main.tsx`, `App.tsx`, `router.tsx` | Bootstrap, providers, routes under `/dashboard` (all lazy-loaded) |
| `lib/http.ts` | `request()`: builds the URL with `createApiUrl` (`VITE_API_BASE_URL` + path, relative to the browser origin), adds JSON headers, throws `ApiError` |
| `lib/api.ts` | One object that lists every endpoint and its SWR key |
| `lib/swr.ts` | SWR defaults. `liveResourceConfig` (poll every `VITE_LIVE_RESOURCE_POLL_INTERVAL_MS`), `liveListConfig` (keeps old rows while refreshing) |
| `lib/env.ts`, `schemas/env.ts` | Checks that the `VITE_*` poll intervals are integers ≥ 1000 |
| `lib/page-meta.ts`, `lib/navigation.ts` | Header titles and sidebar groups (by mode) |
| `lib/utils.ts` | `cn`, `createApiUrl`, `parseTests`, formatting |
| `lib/helpers.ts` | `ApiError`, `slaveLiveness`, `extractApiError` |
| `lib/schema.ts`, `lib/profile-config.ts` | Order and profile form schemas and payload builders |
| `contexts/machine-context.tsx` | One shared poll of `/info`, `/slaves` (master) and `/slave-connection` (slave) |
| `hooks/` | `use-tabbed-filters` (filters stored in the URL), `use-debounce-callback`, `use-slave-connection`, `use-profile-form`, `use-async-action`, … |
| `components/ui/` | shadcn-style primitives. `components/common/` holds shared widgets (status badges, pagination, `slaveSetupNotice`) |
| `pages/` | One folder per screen (below) |
| `types/api.ts` | Response types |

### Screens

| Route | Page | Backend calls |
| --- | --- | --- |
| `/dashboard` | `pages/dashboard.tsx` (overview) | `/info`, SDK `/orders`, `/results/count`, `/profiles/count` |
| `/dashboard/orders` | `pages/orders/index.tsx`. The "Machine Orders" tab shows SDK orders; the "Orders" tab shows the agent inbox. | SDK `/orders*` (list, resend, delete), `/agent-orders*` (list, reject, edit, delete) |
| `/dashboard/orders/:id` | `orderDetail.tsx` | SDK `/orders/:id` |
| `/dashboard/results` | "Machine Results" (SDK) and "External Results" (outbox: retry, reconcile) | SDK `/results*`, `/external-results*` |
| `/dashboard/statistics` | Learned turnaround | SDK `/test-statistics*` |
| `/dashboard/profiles`, `/profiles/:id` | Analyzer setup: create, edit, start, stop, delete | SDK `/profiles*`, `/drivers` |
| `/dashboard/catalogs` | Test catalogs per driver | SDK `/catalogs*` |
| `/dashboard/drivers` | Registered drivers | SDK `/drivers` |
| `/dashboard/control`, `/control/slaves/:id` | Master only: slaves, slave orders, slave results | `/slaves*`, `/slave-orders`, `/slave-results` |
| `/dashboard/master-connection` | Slave only: connection card and form | `/slave-connection` |

Orders created from the "Machine Orders" tab go **straight to the SDK**. They
are not inbox rows, so their results are never uploaded to MediCloud (and see
[H3](KNOWN_ISSUES.md#h3-fallback-matching-can-attach-an-old-result-to-a-new-dispatch)).

## Refresh settings

`frontend/.env` (see `frontend/.env.example`). Vite bakes these values in at
**build** time.

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | Empty means same origin (the normal setting). It can be an absolute URL or a prefix such as `/api`. |
| `VITE_MASTER_CONNECTION_POLL_INTERVAL_MS` | Poll interval for `/slave-connection` while it is configured |
| `VITE_LIVE_RESOURCE_POLL_INTERVAL_MS` | Poll interval for live lists and `/info` |

Polling pauses in hidden or offline tabs. Configuration screens refresh on
focus or reconnect only. These intervals do **not** affect the backend
workers.

## Rebuilding

```powershell
cd frontend
npm ci
npm run build          # tsc -b && vite build → frontend/build (base "/dashboard/")
cd ..
deno task compile:agent:win   # to embed it in the exe
```

During development, `npm run dev` starts Vite. Set `VITE_API_BASE_URL` to the
agent's URL (for example `http://127.0.0.1:5001`). CORS `*` is what allows
this today. `npm run lint` does not work, because there is no ESLint config.
