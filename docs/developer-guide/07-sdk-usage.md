# 7. How the agent uses the SDK

The SDK (`../medicloud-agent-sdk`) owns everything about analyzers: drivers,
protocols (ASTM and others), transports (TCP, serial via Node), and its own
`machines.db`. It has its own guide. This page covers only the boundary.

## Import

[deno.json](../../deno.json):

```json
"@mediCloud/sdk/manager": "../medicloud-agent-sdk/machineManager.ts",
"@mediCloud/sdk/registry": "../medicloud-agent-sdk/registry.ts"
```

Only `manager` is used ([main.ts](../../main.ts), [types.ts](../../types.ts)).
The SDK's own bare imports (such as `@zod/zod`) resolve through the
**agent's** import map, so both maps must agree on those packages.

## Construction

```ts
const manager = new MachineManager({
  dbPath: env.MEDICLOUD_MACHINES_SDK_DB_PATH,
  onResultPersisted: (result) => resultDispatcher.onResult(result),
});
const machineHandler = await manager.getHandler();   // connects DB, starts enabled profiles
app.all("*", (c) => machineHandler(c.req.raw));        // SDK routes share the agent port
```

- `getHandler()` returns a plain Fetch handler. The SDK's own `listen()` and
  its separate HTTP port are **not** used.
- `onResultPersisted` fires after the SDK commits a result. The SDK calls it
  "fire-and-forget" and catches errors (`registry.ts` around line 996). A
  failing hook is logged by the SDK and does not crash the driver.
- `manager.shutdown()` is called in `gracefulShutdown`.

## SDK HTTP routes the agent calls

All are called through `env.AGENT_LOCAL_URL` from [lib/api.ts](../../lib/api.ts)
and checked with the Zod schemas in [schemas/local.ts](../../schemas/local.ts).

| Agent function | SDK route | Used by |
| --- | --- | --- |
| `fetchMachineProfiles` | `GET /profiles` | capabilities, local order creation |
| `fetchMachineHealth` | `GET /health` | capabilities, `/info` |
| `fetchDriverCatalog` | `GET /catalogs?driver=<id>` | capabilities |
| `postMachineOrder` | `POST /orders` | order pull, local orders |
| `fetchMachineOrder` | `GET /orders/:id` | local order edit/delete guard |
| `patchMachineOrder` | `PATCH /orders/:id` | local order edit |
| `deleteMachineOrder` | `DELETE /orders/:id` | local order delete |
| `fetchMachineResultsPage` | `GET /results?limit&offset` | reconcile (20 s timeout) |

The dashboard frontend also calls SDK routes directly through the catch-all:
`/drivers`, `/catalogs*`, `/profiles*` (including `/start` and `/stop`),
`/orders*`, `/results*` and `/test-statistics*`.

`postMachineOrder` removes `undefined`, `""` and `[]` fields before posting,
because the SDK's `CreateOrderSchema` is strict and rejects empty strings.
If `tests` is empty, the SDK falls back to the driver's default tests.

## Behavior of the SDK that matters to the agent

- **`POST /orders` talks to the analyzer.** `registry.submitOrder()` awaits
  `machine.sendOrder()`. A slow analyzer means a slow HTTP call, and the
  agent sets no timeout
  ([M3](KNOWN_ISSUES.md#m3-local-sdk-calls-have-no-timeout-so-the-order-loop-can-stall)).
- **One active order per machine and sample.** `assertNoActiveOrderConflict`
  refuses a second pending or testing order for the same sample. The agent
  then marks the dispatch `failed`.
- **Results are matched by sample.** The SDK attaches an incoming result to
  the oldest active order for that machine and sample. It saves only the
  first result per order, and drops results that match no order. So every
  SDK result has an `orderId`.
- **Results list is newest first** (`ORDER BY received_at DESC`), which
  reconcile pages through.
- **Serial transport** spawns `node <sdk>/lib/node-serial.mjs`. Node must be
  installed, and the file must exist on the real disk
  ([H5](KNOWN_ISSUES.md#h5-serial-analyzers-probably-cannot-start-from-the-compiled-exe)).
- **`SERIAL_TRACE`** is read by the SDK straight from the environment.

## Profile keys

The agent builds `profileKey = "<driverId>:<profileId>"` (`getLocalMachineCapabilities`).
Whenever it needs the SDK machine id, it takes the last `:` segment. That
segment must be the numeric profile id, which is also the `machineId` in SDK
orders and results.
