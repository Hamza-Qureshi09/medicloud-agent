# 16. Slave connection lifecycle and worker coordination

## Startup and persisted settings

[Slave runtime](../../flow/slave/runtime.ts) creates a connection only in slave mode. Its settings file lives beside the configured agent SQLite database. [SlaveConnection](../../flow/slave/connection.ts) loads saved settings first. If the file is missing, it validates the environment defaults. If the file exists but cannot be loaded, the slave remains unconfigured and reports a storage error. A persisted disconnect record suppresses environment fallback and retains the previous identity.

## Connect and disconnect

The [dashboard connection routes](../../routes/dashboard/slaveConnection.ts) drive the lifecycle. Saving while already configured returns a conflict. To replace a master, remove the current connection, then add the replacement. On add, settings are validated and the new connection is verified before the settings file is written atomically. Removal writes the disconnect record before clearing the in-memory connection.

The previous identity consists of master host, port, and slave ID. If any of those change and the [connection repository](../../db/repositories/slaveConnection.ts) detects synchronized work, the change is rejected. A separate data directory isolates a different identity. A change that keeps the same identity still goes through connection verification.

## Synchronization during a settings change

[Worker coordination](../../flow/workers.ts) stops the heartbeat, order pull, and result retry loops, then waits for in-flight work to drain. An overlapping update or drain timeout returns a conflict. While settings are changing, the connection getter returns a service-unavailable error. Cleanup resumes workers only if the slave is configured, so a successful disconnect keeps them stopped.

The status returned to the dashboard includes the connection state and heartbeat freshness. It exposes whether a secret exists and omits the secret value. A configured slave with no recorded heartbeat reports connecting. A verified connection saved through the dashboard records a successful heartbeat immediately. An expired heartbeat or a recorded failure reports disconnected. See [connection lifecycle tests](../../tests/connectionLifecycle.test.ts) and [route tests](../../tests/slaveConnectionRoutes.test.ts).

## Capability reporting

[Capability assembly](../../flow/sync/capabilities.ts) fetches SDK profiles and health concurrently. It matches running state by numeric profile ID and fetches each driver's catalog. Disabled tests are excluded from the test-code list. The richer catalog payload includes only tests with analyte definitions. If one catalog fails, that profile is logged and skipped while other profiles remain reportable.

In master mode, active slave profiles are appended with keys of the form `slave:<slaveId>:<profileKey>` for routing. An invalid stored capability payload is logged and skipped for that slave. Direct and slave modes report local profiles.
