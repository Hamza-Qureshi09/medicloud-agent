ALTER TABLE `syncOrderInbox` ADD `source` text DEFAULT 'upstream' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_slaveRegistry` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`slaveId` text NOT NULL UNIQUE,
	`instanceId` text UNIQUE,
	`secretHash` text,
	`host` text,
	`port` integer,
	`machinesJson` text NOT NULL,
	`lastPingAt` text,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_slaveRegistry`(`id`, `slaveId`, `instanceId`, `secretHash`, `host`, `port`, `machinesJson`, `lastPingAt`, `isActive`, `createdAt`, `updatedAt`) SELECT `id`, `slaveId`, `instanceId`, `secretHash`, `host`, `port`, `machinesJson`, `lastPingAt`, `isActive`, `createdAt`, `updatedAt` FROM `slaveRegistry`;--> statement-breakpoint
DROP TABLE `slaveRegistry`;--> statement-breakpoint
ALTER TABLE `__new_slaveRegistry` RENAME TO `slaveRegistry`;--> statement-breakpoint
PRAGMA foreign_keys=ON;