# 15. Glossary

| Term | Meaning |
| --- | --- |
| **Agent** | This program. It runs at the lab and links analyzers to MediCloud. |
| **Analyzer / machine** | A lab instrument. In the SDK it is a running **profile**. |
| **Profile** | An SDK record: driver + connection config + enabled flag. Its numeric `id` is the SDK `machineId`. |
| **Driver** | SDK code for one analyzer model (`driverId`, such as `sysmexKx21n`). |
| **Catalog** | The tests a driver supports. Each test has **analytes**, the individual values it reports (assay codes). |
| **profileKey** | `driverId:profileId`. On a master, slave machines use `slave:<slaveId>:driverId:profileId`. |
| **Capabilities** | The machine list sent in the heartbeat. |
| **Dispatch** | MediCloud's record that sends one order to one machine of one agent. `dispatchId` is its ObjectId. |
| **Lease** | A time-limited claim on dispatches (5 min upstream, 5 min master → slave). It is confirmed by an **ack**. |
| **Ack** | `/orders/ack`: confirms which leased dispatches were accepted or rejected. |
| **Inbox** | The `syncOrderInbox` table: orders held by this agent. |
| **Outbox** | The `medicloudResultDispatch` table: results waiting for delivery. |
| **Idempotency key** | `<dispatchId>:<resultId>`. Lets upstream drop a repeated upload. |
| **Reconcile** | Rescanning SDK results to rebuild missing outbox rows. |
| **Abandon** | Giving up on a result after it fails for good. The order is marked failed and reported. |
| **Transient failure** | No response, 408, 429 or 5xx. Retried without using the budget. |
| **Upstream** | What this agent talks to: MediCloud (direct and master) or the master (slave). |
| **Direct / master / slave** | The agent modes. See [modes](03-modes-and-topology.md). |
| **Slave slot** | A `slaveRegistry` row created by "Register" on the master. |
| **Instance id** | The UUID in `data/agent-instance-id`. Identifies one running installation. |
| **Local order** | An order created in the agent dashboard (`source=local`). It is never sent to MediCloud. |
| **SDK-direct order** | An order created on the "Machine Orders" tab, stored only in the SDK. |
| **Capacity** | 50 minus the in-flight inbox rows. Sent with each pull. |
| **WAL** | SQLite write-ahead log mode. It produces the `-wal` and `-shm` files. |
