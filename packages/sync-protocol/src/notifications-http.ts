// What the notification routes answer, and what a client sends them.

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Delivery adapters supported for workspace comment notifications. */
export const NOTIFICATION_ADAPTERS = Object.freeze([
  "webhook",
  "slack",
  "email",
] as const);

export type NotificationAdapter = (typeof NOTIFICATION_ADAPTERS)[number];

/** Outbound notification event kinds. */
export const NOTIFICATION_EVENTS = Object.freeze([
  "thread_opened",
  "reply_added",
  "person_mentioned",
] as const);

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number];

/** Delivery health for an enabled notification adapter, visible to workspace owners only. */
export type NotificationDeliveryState = "delivering" | "retrying" | "stopped";

/** One adapter row returned by GET /api/workspace/notifications and POST /api/workspace/notifications/set. */
export interface NotificationAdapterStatus {
  adapter: NotificationAdapter;
  on: boolean;
  /** False for email when either MANENT_RESEND_API_KEY or MANENT_RESEND_FROM is missing. */
  available: boolean;
  /** Masked destination hint for owners only; always null for non-owners or when off. */
  hint: string | null;
  /** Current delivery state for owners only; always null for non-owners or when off. */
  state: NotificationDeliveryState | null;
  /** Next retry instant in epoch ms for owners while retrying; null otherwise. */
  nextTryAt: number | null;
}

/** Response for GET /api/workspace/notifications. */
export interface NotificationsGetResponse {
  adapters: NotificationAdapterStatus[];
}

/** Request body for POST /api/workspace/notifications/set. */
export interface NotificationsSetRequest {
  workspaceId: string;
  adapter: NotificationAdapter;
  /** Destination address to save, or null to remove and turn off the adapter. */
  address: string | null;
}

/** Response for POST /api/workspace/notifications/set. */
export interface NotificationsSetResponse {
  adapters: NotificationAdapterStatus[];
}

/** True when value is one of the supported notification adapters. */
export function isNotificationAdapter(
  value: unknown,
): value is NotificationAdapter {
  return NOTIFICATION_ADAPTERS.some((adapter) => adapter === value);
}

/** True when value is a well-formed NotificationsSetRequest body. */
export function isNotificationsSetRequest(
  value: unknown,
): value is NotificationsSetRequest {
  if (typeof value !== "object" || value === null) return false;
  const workspaceId: unknown = Reflect.get(value, "workspaceId");
  const adapter: unknown = Reflect.get(value, "adapter");
  const address: unknown = Reflect.get(value, "address");
  return (
    typeof workspaceId === "string" &&
    WORKSPACE_ID_PATTERN.test(workspaceId) &&
    isNotificationAdapter(adapter) &&
    (address === null || typeof address === "string")
  );
}
