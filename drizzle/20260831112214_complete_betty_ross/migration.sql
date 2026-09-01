CREATE TABLE `medicloudResultDispatch` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`agentResultId` integer UNIQUE,
	`agentOrderId` integer NOT NULL,
	`medicloudOrderId` text NOT NULL,
	`medicloudDispatchId` text NOT NULL,
	`idempotencyKey` text NOT NULL UNIQUE,
	`payloadJson` text NOT NULL,
	`deliveryStatus` integer DEFAULT 0 NOT NULL,
	`sentAt` text,
	`errorText` text,
	`retryCount` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slaveRegistry` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`slaveId` text NOT NULL UNIQUE,
	`instanceId` text UNIQUE,
	`secretHash` text,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`machinesJson` text NOT NULL,
	`lastPingAt` text NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `syncOrderInbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`dispatchId` text NOT NULL UNIQUE,
	`leaseId` text NOT NULL,
	`profileKey` text NOT NULL,
	`driverId` text NOT NULL,
	`targetSlaveId` text,
	`payloadJson` text NOT NULL,
	`agentOrderId` integer UNIQUE,
	`status` text DEFAULT 'received' NOT NULL,
	`errorText` text,
	`receivedAt` text NOT NULL,
	`acknowledgedAt` text,
	`submittedAt` text,
	`completedAt` text,
	`downstreamLeaseId` text,
	`downstreamLeaseExpiresAt` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_inbox_upstream` ON `syncOrderInbox` (`status`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `idx_sync_inbox_slave` ON `syncOrderInbox` (`targetSlaveId`,`status`,`downstreamLeaseExpiresAt`);