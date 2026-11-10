# Known issues

This list comes from a code review on 2 November 2026. Every item was traced
through the code. Nothing here has been fixed yet.

- **Confirmed** means the failing path was traced end to end, or reproduced
  (for example with the backend's own validator).
- **Likely** means the code path is real, but it depends on runtime conditions
  that were not reproduced (hardware, a compiled exe, timing).

The earlier [REVIEW_AND_REFACTOR_REPORT.md](../../REVIEW_AND_REFACTOR_REPORT.md)
is not fully accurate. For example, it names `frontend/src/lib/api-url.ts` and
`frontend/src/lib/order-tests.ts`, but neither file exists (see M2).

## Tool results (2 November 2026, Deno 2.9.8, Windows 10)

| Command | Result |
| --- | --- |
| `deno task check` | Pass |
| `deno task lint` | Pass (56 files) |
| `deno task test` | **Fails.** Type check error TS2307 in `tests/frontendUtilities.test.ts`, so **no tests run** (see M2). |
| The other 7 test files run on their own | 14 passed (7 steps), 0 failed |

## Summary

| ID | Severity | Area | Title | Confidence |
| --- | --- | --- | --- | --- |
| C1 | Critical | agent ↔ backend | MediCloud rejects the heartbeat when catalog analytes have extra fields | Confirmed |
| H1 | High | jobs | Non-network failures use up the whole batch's retry budget in about 3.5 minutes | Confirmed |
| H2 | High | jobs / DB | Inbox rows never expire, so capacity leaks until pulling stops | Confirmed |
| H3 | High | agent ↔ SDK | Fallback matching can attach an old result to a new dispatch | Likely |
| H4 | High | security | Dashboard and SDK API have no auth, use `cors("*")`, and bind to 0.0.0.0 by default | Confirmed |
| H5 | High | build / SDK | Serial analyzers probably cannot start from the compiled exe | Likely |
| M1 | Medium | agent ↔ backend | One status the backend refuses blocks every queued status | Confirmed |
| M2 | Medium | tests | `deno task test` fails type checking, so zero tests run | Confirmed |
| M3 | Medium | agent ↔ SDK | Local SDK calls have no timeout, so the order loop can stall | Likely |
| M4 | Medium | jobs | A crash after the SDK accepts an order leads to a false "failed" and a lost result | Likely |
| M5 | Medium | master/slave | "Mark inactive" does not stop a slave | Confirmed |
| M6 | Medium | master/slave | Deleting a slave strands its orders | Confirmed |
| M7 | Medium | master/slave | A duplicate slave `instanceId` makes heartbeats fail with 500 | Confirmed |
| M8 | Medium | Windows / paths | Data paths depend on the working directory, and the instance-id path ignores the DB setting | Confirmed |
| M9 | Medium | build / security | The compile tasks embed the developer `.env`, secrets included | Confirmed |
| L1 | Low | agent ↔ backend | Backend error messages are dropped ("HTTP 400" only) | Confirmed |
| L2 | Low | master/slave | The master forwards slave statuses twice | Confirmed |
| L3 | Low | dashboard | Retrying a result sets the wrong inbox status for slave orders | Confirmed |
| L4 | Low | frontend | Unknown dashboard URLs redirect outside `/dashboard` | Confirmed |
| L5 | Low | agent ↔ backend | Ack never sends `localOrderId` | Confirmed |
| L6 | Low | jobs | Reconcile rescans all SDK results every 60 s | Confirmed |
| L7 | Low | config | `MEDICLOUD_MACHINES_INTERNAL_HTTP_ENABLED` does nothing | Confirmed |
| L8 | Low | Windows / security | The `0600` mode on `slave-connection.json` does nothing on Windows | Likely |
| L9 | Low | migrations | The Drizzle snapshot history branches | Likely |
| L10 | Low | lifecycle | Shutdown on Windows covers only Ctrl+C | Confirmed |
| L11 | Low | jobs | An upstream outage while marking an order failed aborts the resume loop | Confirmed |

### Contract mismatches at a glance

**Agent ↔ backend (`medicloud/controllers/agentSync.ts`):** C1, M1, L1, L5.
Paths, auth headers (`x-agent-id`, `x-agent-secret`, `x-agent-instance-id`),
`{status, data}` unwrapping, the pull/ack/status/results fields and the status
values (`processing`, `failed`) all match. H1 is how the agent classifies
backend replies.

**Agent ↔ SDK (`medicloud-agent-sdk`):** H3, H5, M3, M4. The imports match.
`MachineManager` exists, `dbPath` and `onResultPersisted` exist,
`getHandler()` and `shutdown()` exist, and the HTTP routes and body schemas
that the agent uses (`/profiles`, `/health`, `/catalogs`, `/orders`,
`/orders/:id`, `/results`) match the agent's Zod schemas. The SDK catches
errors thrown by `onResultPersisted` (`registry.ts` around line 996), so a
rejected `onResult` cannot crash the process. The `@mediCloud/sdk/registry`
mapping in `deno.json` is unused.

---

## Critical

### C1. MediCloud rejects the heartbeat when catalog analytes have extra fields

- **Where:** [schemas/sync.ts:14](../../schemas/sync.ts) (`CatalogAnalyteSchema.loose()`),
  [flow/sync/capabilities.ts:47](../../flow/sync/capabilities.ts). Backend:
  `medicloud/models/agentRegistration.ts:6` (`MachineAnalyteSchema`).
- **What is wrong:** The agent copies each analyte from the SDK catalog
  unchanged into `machines[].catalog[].analytes[]`. The SDK seeds include
  `category` (and `decimals` for Sysmex) on analytes. See
  `medicloud-agent-sdk/store/catalogSeeds.ts:72-78` (Sysmex KX-21N) and
  `:120-126` (Bonavera Count). The backend schema allows only `code`, `name`
  and `unit`. The backend validator (`@oridune` validator, the version in the
  backend import map) rejects unknown keys. A local run printed
  `Unexpected property has been encountered!` at `...category`.
- **Failure scenario:** A lab adds a Sysmex KX-21N or Bonavera Count profile.
  Every heartbeat to `/api/agent-sync/heartbeat` gets a validation error. The
  registration's `machines` and `lastPingAt` never update. MediCloud shows the
  agent as offline, and staff cannot map or dispatch orders to it. In master
  mode, one such slave machine breaks the heartbeat for the whole site.
- **Fix:** In `getLocalMachineCapabilities`, map each analyte to
  `{ code, name, ...(unit ? { unit } : {}) }`. A longer-term option is to make
  the backend schema tolerant of extra keys.
- **Confidence:** Confirmed.

## High

### H1. Non-network failures use up the whole batch's retry budget in about 3.5 minutes

- **Where:** [jobs/resultDispatcher.ts:213](../../jobs/resultDispatcher.ts),
  [jobs/resultDispatcher.ts:289-329](../../jobs/resultDispatcher.ts),
  [lib/error.ts:54-64](../../lib/error.ts).
- **What is wrong:** A failure is "transient" only when there is no response,
  or the status is 408, 429 or 5xx. All other failures add one to `retryCount`
  for **every row in the batch** (up to 100 rows):
  - 401 (secret rotated or wrong), 403, 404 (wrong `MEDICLOUD_API_URL`), 400.
  - A local `ZodError` from parsing one row's `payloadJson`.
  - A schema mismatch in the 2xx response.

  The loop runs about every 10 s with no backoff. After 20 attempts (about
  3.5 minutes) all rows become `failed`, and `abandon()` marks their inbox
  rows `failed` and reports `failed` to MediCloud. One bad row poisons the
  whole batch. For example, an analyte whose `assayNo` became `""` makes the
  backend reject the whole request with 400. Backend `APPLY_FAILED`
  rejections are `retryable` but use the same short budget.
- **Failure scenario:** An admin rotates the agent secret, or the URL is
  mistyped during an install. Within minutes, every queued patient result is
  marked permanently failed, and MediCloud is told the orders failed. Someone
  must notice and press Retry on each row in the dashboard.
- **Fix:** Treat 401, 403 and 404 as "offline" (back off, keep the budget).
  Validate rows one by one before sending, and fail only the bad row. Add
  exponential backoff per row (store a `nextAttemptAt`).
- **Confidence:** Confirmed.

### H2. Inbox rows never expire, so capacity leaks until pulling stops

- **Where:** [jobs/orderPull.ts:200-207](../../jobs/orderPull.ts),
  [lib/constants.ts](../../lib/constants.ts) (`IN_FLIGHT_STATUSES`, `MAX_CAPACITY = 50`).
- **What is wrong:** Free capacity is `50 − rows in received, acknowledged,
  processing, leased_to_slave or acknowledged_by_slave`. Nothing ever moves a
  row out of `processing` or `acknowledged_by_slave` unless a result is
  delivered. Some orders never produce a result: the tube was never loaded,
  the SDK order expired after 24 h, or the analyzer failed. Local dashboard
  orders (`source = local`) also count.
- **Failure scenario:** After 50 such orders, the agent logs "At capacity,
  skipping pull" forever. No new MediCloud orders reach the lab until someone
  edits the database.
- **Fix:** Add a sweep that checks the SDK order status (via `GET /orders/:id`)
  and marks rows `failed` (with a reported status) when the SDK order is
  failed or expired, or when the row is older than a TTL. Count only
  `source = 'upstream'` rows in capacity.
- **Confidence:** Confirmed.

### H3. Fallback matching can attach an old result to a new dispatch

- **Where:** [db/repositories/resultQueue.ts:20-47](../../db/repositories/resultQueue.ts),
  [jobs/resultDispatcher.ts:61-81, 151](../../jobs/resultDispatcher.ts).
- **What is wrong:** When a result's `orderId` matches no inbox row, the agent
  matches it to any single upstream row in `acknowledged` or `processing`
  that has the same `sampleId` and profile id and no `agentOrderId`. It does
  not check time. `reconcile()` reruns this over **all** SDK results every
  60 s. Some results are never linked to an inbox row, for example:
  - orders created on the dashboard's "Machine orders" tab, which go straight
    to the SDK;
  - results left over after `agent.db` was reset while `machines.db` was kept.
- **Failure scenario:** A lab reuses daily sample numbers. An old result for
  sample `12` exists in the SDK but in no inbox row. A new MediCloud dispatch
  for sample `12` on the same analyzer is acknowledged, and the analyzer
  handshake (`sendOrder`) takes a few seconds. During that time, reconcile
  links the **old** result to the new dispatch, queues it, and uploads it.
  MediCloud records a stale result for the patient.
- **Fix:** Only match when `result.receivedAt >= inbox.acknowledgedAt`
  (or `receivedAt`). Better still, record the SDK order id before the
  result can arrive and drop the sample-based fallback.
- **Confidence:** Likely. The race window and data preconditions were not
  reproduced.

### H4. Dashboard and SDK API have no auth, use `cors("*")`, and bind to 0.0.0.0 by default

- **Where:** [main.ts:46](../../main.ts) (`app.use("*", cors())`),
  [schemas/env.ts:39](../../schemas/env.ts) (`MEDICLOUD_AGENT_HTTP_HOST` defaults to `0.0.0.0`),
  [main.ts:67](../../main.ts) (catch-all forward to the SDK).
- **What is wrong:** No dashboard route checks who is calling. Only
  `PUT/DELETE /slave-connection` checks the Origin. Hono's `cors()` default
  sends `Access-Control-Allow-Origin: *`. That lets any web page open in the
  lab browser read `/agent-orders` (patient names) and call
  `POST /slaves/register` (it returns a slave secret). It can also stop
  analyzers and delete profiles through the SDK routes. If `.env` omits the
  host, the server listens on every network interface. Master mode must
  listen on the LAN anyway, so slaves can connect.
- **Failure scenario:** A staff PC on the lab LAN, or a malicious ad in a
  browser on the agent PC, lists patient data or deletes analyzer profiles.
- **Fix:** Remove `cors()` (the dashboard is same-origin). Default the host to
  `127.0.0.1`. Add a dashboard token or login, and apply the Origin check to
  all state-changing routes.
- **Confidence:** Confirmed.

### H5. Serial analyzers probably cannot start from the compiled exe

- **Where:** [deno.json](../../deno.json) (`compile.include` lists only
  `./drizzle` and `./frontend/build`). SDK:
  `medicloud-agent-sdk/transports/machineCom.ts:241-245`,
  `medicloud-agent-sdk/lib/utils.ts:4-10`.
- **What is wrong:** The SDK opens serial ports by spawning an external
  `node` process with the path of `lib/node-serial.mjs`, resolved from
  `import.meta.url`. In a `deno compile` exe:
  - that `.mjs` file is not embedded;
  - even an embedded file lives only in Deno's virtual file system, which an
    external `node.exe` cannot read.

  The lab PC also needs Node.js and its serial package.
- **Failure scenario:** A field install uses `lis-middleware.exe` with a
  COM-port analyzer. The profile starts, then the transport fails because
  Node cannot find the script, and no orders or results flow. TCP analyzers
  are not affected.
- **Fix:** Ship `node-serial.mjs` next to the exe and pass its real path, or
  write it to a temp dir at startup. Document the Node.js prerequisite.
  Verify on a clean PC.
- **Confidence:** Likely. A compiled exe was not built and tested with a
  serial device.

## Medium

### M1. One status the backend refuses blocks every queued status

- **Where:** [jobs/orderPull.ts:158-195](../../jobs/orderPull.ts) (`flushPendingStatuses`, `break` on error).
  Backend: `agentSync.ts` `reportStatus` (`message: e.string().max(1000)`).
- **What is wrong:** Statuses are retried in rowid order, and the loop stops
  at the first error. A message over 1000 characters is refused by the
  backend validator (checked locally: "String is greater than maximum
  length!"), and so is any other permanent 4xx. That row is retried on every
  cycle, and every row after it waits forever. Long messages are realistic:
  `abandon()` stores `describeError(error)`, which for a `ZodError` is a
  multi-line JSON list of issues. `markFailed` stores the SDK error text.
  Slaves can also send messages of any length.
- **Failure scenario:** One abandoned batch with a Zod error message. From
  then on, no "failed" or "processing" update for any order reaches MediCloud.
- **Fix:** Truncate messages to 1000 characters. On a 4xx reply, clear or
  park the row instead of `break`.
- **Confidence:** Confirmed (the validator behavior was reproduced; the long
  message comes from the traced code path).

### M2. `deno task test` fails type checking, so zero tests run

- **Where:** [tests/frontendUtilities.test.ts:2-3](../../tests/frontendUtilities.test.ts).
- **What is wrong:** The test imports `frontend/src/lib/api-url.ts` and
  `frontend/src/lib/order-tests.ts`. They do not exist. `createApiUrl` and
  `parseTests` now live in `frontend/src/lib/utils.ts`. The type check fails
  before any test runs.
- **Failure scenario:** CI or a developer runs `deno task test` and sees one
  error, and none of the 14 working regression tests run.
- **Fix:** Import both functions from `../frontend/src/lib/utils.ts`.
- **Confidence:** Confirmed (run output above).

### M3. Local SDK calls have no timeout, so the order loop can stall

- **Where:** [lib/api.ts:44-200](../../lib/api.ts) (all local calls except
  `fetchMachineResultsPage`), [jobs/orderPull.ts:421](../../jobs/orderPull.ts).
- **What is wrong:** SDK `POST /orders` awaits `machine.sendOrder()`, which
  talks to the analyzer (`registry.ts:521-561`). Some protocol variants have
  ACK timeouts, but the agent sets no limit of its own. If a driver hangs,
  `tick()` never finishes, `running` stays `true`, and no further pulls,
  re-acks or status flushes happen. `pauseAgentWorkers` then returns 409 for
  every slave connection change.
- **Failure scenario:** An analyzer is half-connected (the TCP socket is open
  but no ASTM ACK comes back) on a driver without an ACK timeout. All order
  intake stops until the agent restarts.
- **Fix:** Add `signal: AbortSignal.timeout(...)` to every local fetch
  (longer for `POST /orders`), and treat a timeout as "unknown, re-check via
  `GET /orders?sampleId=`".
- **Confidence:** Likely.

### M4. A crash after the SDK accepts an order leads to a false "failed" and a lost result

- **Where:** [jobs/orderPull.ts:415-450](../../jobs/orderPull.ts),
  [db/repositories/resultQueue.ts:20-27](../../db/repositories/resultQueue.ts).
- **What is wrong:** `submitOrder` posts to the SDK first and saves
  `agentOrderId` second. If the process dies in between, the row is still
  `acknowledged` with no `agentOrderId`, and it is submitted again after
  restart. The SDK refuses the second order (`assertNoActiveOrderConflict`,
  same machine and sample), so `markFailed` reports `failed` to MediCloud.
  The first order is still on the analyzer. Its result then matches nothing:
  `agentOrderId` is null, and the fallback skips `failed` rows.
- **Failure scenario:** A power cut at the wrong moment. MediCloud shows the
  order as failed, and the real result stays only in the SDK database.
- **Fix:** Before submitting, look up an active SDK order with the same
  machine and sample (`GET /orders?machineId=&sampleId=`) and adopt it. Or
  write a "submitting" marker before the POST.
- **Confidence:** Likely.

### M5. "Mark inactive" does not stop a slave

- **Where:** [flow/master/slaveRegistry.ts:47-73](../../flow/master/slaveRegistry.ts),
  [routes/slaveSync/auth.ts](../../routes/slaveSync/auth.ts).
- **What is wrong:** `authenticate()` checks only the secret hash, not
  `isActive`. `ping()` sets `isActive: true` on the next heartbeat.
- **Failure scenario:** An operator marks a misbehaving slave inactive. Within
  30 s it is active again and keeps pulling orders.
- **Fix:** Reject requests when `isActive` is false, and do not set `isActive`
  inside `ping()`.
- **Confidence:** Confirmed.

### M6. Deleting a slave strands its orders

- **Where:** [flow/master/slaveRegistry.ts:148](../../flow/master/slaveRegistry.ts),
  [routes/dashboard/slaves.ts](../../routes/dashboard/slaves.ts).
- **What is wrong:** The delete removes only the registry row. Inbox rows with
  that `targetSlaveId` stay in `acknowledged`, `leased_to_slave` or
  `acknowledged_by_slave`. They use master capacity (H2) and are never
  reported to MediCloud. Results the slave uploads later get 401.
- **Failure scenario:** A slave PC is replaced and its old slot is deleted.
  Its in-flight orders are never finished or failed in MediCloud.
- **Fix:** On delete, mark the slave's open rows `failed` with
  `upstreamStatusPending = 'failed'`, or block the delete while work is open.
- **Confidence:** Confirmed.

### M7. A duplicate slave `instanceId` makes heartbeats fail with 500

- **Where:** [db/tables/slaveRegistry.ts:21](../../db/tables/slaveRegistry.ts)
  (`instanceId` is `UNIQUE`), [flow/master/slaveRegistry.ts:59-77](../../flow/master/slaveRegistry.ts),
  [routes/slaveSync/heartbeat.ts:31](../../routes/slaveSync/heartbeat.ts).
- **What is wrong:** `ping()` writes the caller's instance id. Two cases give
  two slots the same id:
  - two slave PCs installed from a copied `data/` folder (same
    `agent-instance-id`);
  - a PC that gets a new slot while its old slot still exists.

  The update then breaks the UNIQUE constraint, and Hono returns a bare 500.
- **Failure scenario:** The second slave's "Save and connect" fails with a
  generic message, and its heartbeat never succeeds.
- **Fix:** Drop the UNIQUE constraint, or clear `instanceId` on the other row
  first. Document "never copy `data/` between PCs".
- **Confidence:** Confirmed (mechanism). The scenario depends on how the site
  is installed.

### M8. Data paths depend on the working directory, and the instance-id path ignores the DB setting

- **Where:** [main.ts:22](../../main.ts) (`"./data/agent-instance-id"`),
  [schemas/env.ts](../../schemas/env.ts) (relative defaults `./data/*.db`).
- **What is wrong:** All default paths are relative to the process working
  directory, not to the exe. The instance id is always under `./data`, even
  when `MEDICLOUD_AGENT_DB_PATH` points somewhere else.
- **Failure scenario:** On Windows, the exe is started by a service, Task
  Scheduler, or a shortcut with another "Start in" folder. The working
  directory is then `C:\Windows\System32` (or another folder). The agent
  starts with a new empty `agent.db` and `machines.db` (no profiles, no
  outbox) and a new instance id. Pending results stay in the old folder.
- **Fix:** Resolve relative paths against `dirname(Deno.execPath())` in
  compiled builds. Store the instance id beside `MEDICLOUD_AGENT_DB_PATH`.
- **Confidence:** Confirmed.

### M9. The compile tasks embed the developer `.env`, secrets included

- **Where:** [deno.json:9-18](../../deno.json) (`--env-file=.env` in every
  `compile:*` and `desktop:*` task).
- **What is wrong:** The exe carries whatever is in the build machine's
  `.env`, including `MEDICLOUD_AGENT_ID` and `MEDICLOUD_AGENT_SECRET`. The
  secret can be pulled out of the binary. One exe copied to two labs gives
  both labs the same MediCloud identity. This review did not confirm whether
  real environment variables override the embedded values at runtime.
- **Failure scenario:** An exe built for lab A is copied to lab B. Both pull
  from the same registration and steal each other's leases.
- **Fix:** Do not embed `.env`. Read a `.env` file next to the exe at startup
  (for example `Deno.loadEnv` or a small loader), and build one generic exe.
- **Confidence:** Confirmed (build configuration).

## Low

### L1. Backend error messages are dropped ("HTTP 400" only)

- **Where:** [lib/api.ts:228](../../lib/api.ts).
- **What is wrong:** The backend sends `{ status: false, messages: [{ message, location }] }`.
  The agent reads only `data.message` or `data.error`. `errorText` and logs
  then show only `HTTP 400`.
- **Failure scenario:** A field engineer cannot tell "Agent mode does not
  match registration" (409) from a validation error.
- **Fix:** Also read `data.messages?.[0]?.message`, plus `location`.
- **Confidence:** Confirmed.

### L2. The master forwards slave statuses twice

- **Where:** [routes/slaveSync/orders.ts:221, 234](../../routes/slaveSync/orders.ts).
- **What is wrong:** The route stores `upstreamStatusPending` and also sends
  the update at once with fire-and-forget. A successful send does not clear
  the pending column, so `flushPendingStatuses` sends it again.
- **Failure scenario:** Extra `/orders/status` calls. The backend ignores
  them, so this is noise only.
- **Fix:** Rely only on the durable flush, or clear the column when the
  immediate send succeeds.
- **Confidence:** Confirmed.

### L3. Retrying a result sets the wrong inbox status for slave orders

- **Where:** [jobs/resultDispatcher.ts:102-108](../../jobs/resultDispatcher.ts).
- **What is wrong:** `retryDelivery` always sets the inbox row to
  `processing`. For slave orders the correct value is
  `acknowledged_by_slave`. The slave status route accepts both, so the main
  effect is a wrong label and accounting.
- **Fix:** Keep the existing status unless it is `failed`, and pick the
  status from `targetSlaveId`.
- **Confidence:** Confirmed.

### L4. Unknown dashboard URLs redirect outside `/dashboard`

- **Where:** [frontend/src/router.tsx:91-92](../../frontend/src/router.tsx).
- **What is wrong:** `<Navigate to="/" />` leaves the `/dashboard` route tree.
  The router has no `basename`, so `/` matches nothing.
- **Failure scenario:** A mistyped URL shows a router error page instead of
  the overview.
- **Fix:** Use `to="/dashboard"`.
- **Confidence:** Confirmed.

### L5. Ack never sends `localOrderId`

- **Where:** [jobs/orderPull.ts](../../jobs/orderPull.ts) (`storeAndAcknowledge`).
- **What is wrong:** The backend stores `agentOrderId` from
  `accepted[].localOrderId` so a result can be traced to the order the
  machine ran. The agent acks before it submits, so it never sends this
  field.
- **Fix:** Send it in a later status update, or ack after submit (this needs
  a protocol decision).
- **Confidence:** Confirmed.

### L6. Reconcile rescans all SDK results every 60 s

- **Where:** [jobs/resultDispatcher.ts:61-81, 151](../../jobs/resultDispatcher.ts).
- **What is wrong:** Each scan reads every SDK result, 100 at a time, and runs
  one or more queries per result. The cost grows without limit.
- **Failure scenario:** After a year of results, each scan takes a long time
  and adds load to SQLite and the event loop.
- **Fix:** Keep a high-water mark (the last result id scanned) and do a full
  scan only from the dashboard.
- **Confidence:** Confirmed.

### L7. `MEDICLOUD_MACHINES_INTERNAL_HTTP_ENABLED` does nothing

- **Where:** [schemas/env.ts:38](../../schemas/env.ts).
- **What is wrong:** The variable is parsed but never read. The agent always
  hosts SDK routes through `getHandler()`. `SERIAL_TRACE` (line 41) is
  parsed but read only by the SDK, straight from the environment.
- **Fix:** Remove the variable or wire it up. Document `SERIAL_TRACE` as an
  SDK variable.
- **Confidence:** Confirmed.

### L8. The `0600` mode on `slave-connection.json` does nothing on Windows

- **Where:** [lib/utils.ts:118](../../lib/utils.ts).
- **What is wrong:** Windows ignores `mode`, so the slave secret is protected
  only by the folder's ACL.
- **Fix:** Document this and install into a folder with a restricted ACL, or
  use Windows DPAPI.
- **Confidence:** Likely.

### L9. The Drizzle snapshot history branches

- **Where:** `drizzle/20260917151053_messy_salo/snapshot.json` and
  `drizzle/20260921110255_unusual_quicksilver/snapshot.json`.
- **What is wrong:** Both snapshots list the first snapshot as their parent.
  `unusual_quicksilver` rebuilds `slaveRegistry` a second time. The migration
  run works, because migrations are applied by folder name. However,
  `db:generate` may report a branch, or create a wrong diff.
- **Fix:** Point quicksilver's `prevIds` at messy_salo, then run
  `db:generate` and check that it produces no changes.
- **Confidence:** Likely.

### L10. Shutdown on Windows covers only Ctrl+C

- **Where:** [lib/utils.ts:31-67](../../lib/utils.ts).
- **What is wrong:** On Windows only SIGINT is handled. A service stop, a
  closed console window (SIGBREAK) or a Task Manager kill ends the process
  without stopping workers or the SDK. SQLite WAL keeps the data safe, but
  serial ports and in-flight requests are cut off.
- **Fix:** Also listen for `SIGBREAK` on Windows.
- **Confidence:** Confirmed.

### L11. An upstream outage while marking an order failed aborts the resume loop

- **Where:** [jobs/orderPull.ts:394-410, 484-510](../../jobs/orderPull.ts).
- **What is wrong:** `markFailed` awaits `reportStatus` without a try/catch.
  When upstream is down, the error leaves `resumeStoredOrders` and the rest
  of the pending rows wait 15 s for the next tick. The status is still saved
  in `upstreamStatusPending`, so nothing is lost. It is only slower.
- **Fix:** Wrap the report in try/catch, as `submitOrder` does.
- **Confidence:** Confirmed.
