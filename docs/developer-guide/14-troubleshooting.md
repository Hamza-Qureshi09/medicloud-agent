# 14. Troubleshooting runbook

Start with the console log (see [errors and logging](11-errors-logging.md))
and the dashboard. To look inside `agent.db`, open it read-only with any
SQLite tool while the agent runs (WAL mode allows this).

## Startup

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Exits at once with a Zod error about an env key | Bad env value (for example `AGENT_MODE=Master`, which must be lower case, or a non-numeric port) | Correct `.env` (and rebuild if it is embedded) |
| `MEDICLOUD_AGENT_ID, ... required in direct mode` | Identity values missing | Set all four `MEDICLOUD_*` values, or use slave mode |
| `AddrInUse` | Port 5001 already in use (often another copy of the agent) | Stop the other copy or change `MEDICLOUD_AGENT_HTTP_PORT` |
| No analyzers, empty dashboard after a reinstall or service setup | A different working directory gave a new empty `data/` | Start from the exe folder or use absolute DB paths ([M8](KNOWN_ISSUES.md#m8-data-paths-depend-on-the-working-directory-and-the-instance-id-path-ignores-the-db-setting)) |

## Heartbeat

| Log / symptom | Cause | Fix |
| --- | --- | --- |
| `cannot reach upstream at …` | DNS, firewall, or wrong `MEDICLOUD_API_URL` | Test the URL in a browser. Make sure it has no `/api` suffix. |
| `HTTP 401` | Wrong id or secret, or the secret was rotated | Fix the credentials. **Act quickly:** 401 also uses up result budgets ([H1](KNOWN_ISSUES.md#h1-non-network-failures-use-up-the-whole-batchs-retry-budget-in-about-35-minutes)). |
| `HTTP 409` | `AGENT_MODE` differs from the registration's mode | Make them match |
| `HTTP 400` with Sysmex KX-21N or Bonavera Count profiles | Extra analyte fields rejected ([C1](KNOWN_ISSUES.md#c1-medicloud-rejects-the-heartbeat-when-catalog-analytes-have-extra-fields)) | Code fix needed. As a test, stop that profile and see whether the heartbeat recovers. |
| `[capabilities] Skipped a profile` | That driver's catalog fetch failed | Check SDK `/catalogs?driver=<id>` in the browser |

## Orders

| Symptom | Cause | Fix |
| --- | --- | --- |
| `At capacity, skipping pull.` forever | 50 rows stuck in `processing`, `acknowledged_by_slave` and so on ([H2](KNOWN_ISSUES.md#h2-inbox-rows-never-expire-so-capacity-leaks-until-pulling-stops)) | Find them with `SELECT status, count(*) FROM syncOrderInbox GROUP BY status`. Resolve them in MediCloud, then set them to `failed` by hand. |
| Orders rejected `PROFILE_UNAVAILABLE` | Profile not running, or the profile key changed (for example the profile was recreated with a new id) | Start the profile, and fix the machine mapping in MediCloud |
| Orders rejected `UNSUPPORTED_TEST` | Test code not in the machine catalog, or disabled | Fix the catalog or the mapping |
| Order `failed` with "active order conflict" | The SDK already has an active order for this sample on this machine | Finish or delete the old SDK order |
| No pulls at all, no "Polled" lines, `busy` stuck | A local SDK call hangs ([M3](KNOWN_ISSUES.md#m3-local-sdk-calls-have-no-timeout-so-the-order-loop-can-stall)) | Check the analyzer connection, then restart the agent |
| MediCloud never shows "processing" or "failed" | Status queue blocked ([M1](KNOWN_ISSUES.md#m1-one-status-the-backend-refuses-blocks-every-queued-status)) | `SELECT dispatchId, length(upstreamStatusMessage) FROM syncOrderInbox WHERE upstreamStatusPending IS NOT NULL`. Shorten long messages, or clear the pending status. |

## Results

| Symptom | Cause | Fix |
| --- | --- | --- |
| A result is in "Machine Results" but not in "External Results" | No matching inbox row (an SDK-direct order, or a local order) | That is expected for local and SDK-direct orders. Otherwise click **Reconcile**. |
| External result status 2 (retryable) for a long time | Upstream offline | Restore the network. Rows retry every 60 s. |
| External result status 3 (failed) | Budget used up or permanent rejection | Read `errorText`. Fix the cause, then click **Retry** on the row. |
| `EMPTY_RESULT` | The analyzer sent no analytes | Check the driver mapping in the SDK |

## Master / slave

| Symptom | Cause | Fix |
| --- | --- | --- |
| Slave form says "Could not save and connect" | Wrong host or port, firewall, wrong secret, or a duplicate instance id on the master ([M7](KNOWN_ISSUES.md#m7-a-duplicate-slave-instanceid-makes-heartbeats-fail-with-500)) | Test `http://<master>:<port>/info` from the slave PC. Check the master log for 401 or 500. |
| 409 "Synchronization is still finishing" | Workers were busy for more than 21 s | Try again. If it repeats, see M3. |
| 409 "data directory contains synchronized work" | Changing identity on a used data dir | Reconnect with the same identity, or use a new data dir |
| A slave is offline on the master after "Mark inactive" but comes back | Known behavior ([M5](KNOWN_ISSUES.md#m5-mark-inactive-does-not-stop-a-slave)) | Delete the slot instead, and stop the slave |
| Slave machines missing in MediCloud | No slave heartbeat in the last 2 minutes, or the master heartbeat fails (C1) | Check both logs |

## Serial analyzers in the exe

If a COM-port analyzer never connects in the compiled exe but works with
`deno task dev`, see
[H5](KNOWN_ISSUES.md#h5-serial-analyzers-probably-cannot-start-from-the-compiled-exe).
Check that `node --version` works on the PC.
