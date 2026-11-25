// The notifications waiting to be delivered, stored in the control file.

/** Delivery adapters supported by the notification outbox. */
export const NOTIFICATION_ADAPTERS = Object.freeze([
  "webhook",
  "slack",
  "email",
] as const);

export type NotificationAdapter = (typeof NOTIFICATION_ADAPTERS)[number];

/** How long delivered rows stay in the outbox before due() purges them (30 days in milliseconds). */
export const OUTBOX_RETENTION_MS = 30 * 86_400_000;

/** Sentinel nextTryAt value marking a row that stopped retrying after exhausting its attempts. */
export const OUTBOX_STOPPED_AT = Number.MAX_SAFE_INTEGER;

/** One row in notification_outbox. */
export interface OutboxRow {
  readonly id: number;
  readonly workspaceId: string;
  readonly adapter: NotificationAdapter;
  readonly payload: string;
  readonly attempts: number;
  /** Next scheduled delivery instant in integer milliseconds since the epoch, or OUTBOX_STOPPED_AT when stopped. */
  readonly nextTryAt: number;
  /** Delivery instant in integer milliseconds since the epoch, or null while undelivered. */
  readonly deliveredAt: number | null;
}

/** Summary of an undelivered outbox row for workspace status reporting. */
export interface PendingOutboxRow {
  readonly adapter: NotificationAdapter;
  readonly attempts: number;
  readonly nextTryAt: number;
}

/** Input to enqueue a notification delivery. */
export interface EnqueueOutboxInput {
  readonly workspaceId: string;
  readonly adapter: NotificationAdapter;
  readonly payload: string;
}

/** Control-file repository for queued notification deliveries. */
export interface OutboxStore {
  /** Queues a notification with attempts = 0, nextTryAt = now(), deliveredAt = null. */
  enqueue(input: EnqueueOutboxInput): OutboxRow;
  /** Purges delivered rows older than OUTBOX_RETENTION_MS, then returns up to limit due undelivered rows (nextTryAt ASC, id ASC). */
  due(limit: number): OutboxRow[];
  /** Marks row id delivered at now(). */
  delivered(id: number): void;
  /** Increments attempts and schedules the next try at nextTryAt for an undelivered row. */
  retry(id: number, nextTryAt: number): void;
  /** Increments attempts and marks an undelivered row stopped (nextTryAt = OUTBOX_STOPPED_AT) so due() no longer returns it. */
  giveUp(id: number): void;
  /** Lists undelivered rows for workspaceId in enqueue order (id ASC). */
  pending(workspaceId: string): PendingOutboxRow[];
}

export type NotificationOutbox = OutboxStore;
