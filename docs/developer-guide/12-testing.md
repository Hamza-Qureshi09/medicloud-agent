# 12. Testing

## Commands

```powershell
deno task check   # type-check main.ts and everything it imports
deno task lint    # lint backend folders
deno task test    # deno test --sloppy-imports --allow-env --allow-read --allow-write --allow-net --allow-run=deno tests
```

**Current state (2 Nov 2026):** `check` and `lint` pass. `test` **fails
during type checking**, because
[tests/frontendUtilities.test.ts](../../tests/frontendUtilities.test.ts)
imports two files that do not exist. While this is broken, **no test runs**
([M2](KNOWN_ISSUES.md#m2-deno-task-test-fails-type-checking-so-zero-tests-run)).
To run the rest now, list the files:

```powershell
deno test --sloppy-imports --allow-env --allow-read --allow-write --allow-net --allow-run=deno `
  tests/catalogCapabilities.test.ts tests/connectionLifecycle.test.ts tests/networkModes.test.ts `
  tests/orderReplay.test.ts tests/schemas.test.ts tests/slaveConnection.test.ts tests/slaveConnectionRoutes.test.ts
```

Recorded result on 2 Nov 2026: 14 passed (7 steps), 0 failed, about 10 s.

## What each test file covers

| File | Covers |
| --- | --- |
| `catalogCapabilities.test.ts` | Capability building for direct, slave and master; disabled catalog tests left out |
| `connectionLifecycle.test.ts` | Deleting a slave connection survives an env fallback and keeps the previous identity |
| `networkModes.test.ts` | Starts real agent processes (`--allow-run=deno`) in master, direct and unconfigured-slave modes against local mock servers. Covers the UI connection flow and a restart. This is the slowest test (about 7 s). |
| `orderReplay.test.ts` | A repeated ack does not undo progress. Early machine results queue once. Five concurrent identical slave uploads give one outbox row. |
| `schemas.test.ts` | Sync and dashboard schema behavior; analyte projection |
| `slaveConnection.test.ts` | Host and port validation, persistence across restart, secret never exposed, env fallback, concurrent saves rejected |
| `slaveConnectionRoutes.test.ts` | Settings file path beside the DB; the PUT/GET/DELETE routes with a mocked master |
| `frontendUtilities.test.ts` | Dashboard URL building and test-code parsing import missing modules. A third test checks section and detail page titles. |

Tests that touch the DB set `MEDICLOUD_AGENT_DB_PATH` to a temporary file
**before** importing `db/index.ts`, because the DB opens on import. Copy this
pattern in new tests.

## What is not tested

- Real analyzers (serial or TCP), and the compiled exe.
- The real MediCloud backend. The mocks do not use the backend's strict
  validator, which is why
  [C1](KNOWN_ISSUES.md#c1-medicloud-rejects-the-heartbeat-when-catalog-analytes-have-extra-fields)
  was not caught.
- Result dispatcher retry budgets and abandonment.
- The frontend (only the three helper functions above).

A useful next test is a contract test that runs the agent's real payloads
through the backend's validator schemas.
