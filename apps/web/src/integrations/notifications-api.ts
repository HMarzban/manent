// Workspace notifications HTTP client, address validator, and per-page-load status cache.
import { isNotificationAdapter } from "@manent/sync-protocol";
import type {
  NotificationAdapter,
  NotificationAdapterStatus,
  NotificationDeliveryState,
  NotificationsGetResponse,
  NotificationsSetResponse,
} from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { createHistoryHttp, readBody } from "../history/requests.ts";

export type NotificationsFailure =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "unreachable"
  | "refused";

export type NotificationsAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: NotificationsFailure };

export interface NotificationsApi {
  get(
    workspaceId: string,
  ): Promise<NotificationsAnswer<NotificationsGetResponse>>;
  set(
    workspaceId: string,
    adapter: NotificationAdapter,
    address: string | null,
  ): Promise<NotificationsAnswer<NotificationsSetResponse>>;
}

export type AddressValidationError =
  "not_web_address" | "not_slack_address" | "not_email_address";

const KNOWN_FAILURES: readonly NotificationsFailure[] = Object.freeze([
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_found",
]);

const DELIVERY_STATES: readonly NotificationDeliveryState[] = Object.freeze([
  "delivering",
  "retrying",
  "stopped",
]);

const ADDRESS_LIMIT = 2048;
const EMAIL_LIMIT = 254;
const CONTROL_CHARS = new RegExp("[\\r\\n\\0]");
const EMAIL_PATTERN = new RegExp(
  '^[^\\s@<>(),;:"\\\\]+@[^\\s@<>(),;:"\\\\]+\\.[^\\s@<>(),;:"\\\\]{2,}$',
);
const SLACK_PREFIX = "https://hooks.slack.com/";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDeliveryState = (value: unknown): value is NotificationDeliveryState =>
  typeof value === "string" && DELIVERY_STATES.some((entry) => entry === value);

function isAdapterStatus(value: unknown): value is NotificationAdapterStatus {
  return (
    isObject(value) &&
    isNotificationAdapter(value.adapter) &&
    typeof value.on === "boolean" &&
    typeof value.available === "boolean" &&
    (value.hint === null || typeof value.hint === "string") &&
    (value.state === null || isDeliveryState(value.state)) &&
    (value.nextTryAt === null || typeof value.nextTryAt === "number")
  );
}

function isNotificationsResponse(
  value: unknown,
): value is NotificationsGetResponse {
  return (
    isObject(value) &&
    Array.isArray(value.adapters) &&
    value.adapters.every(isAdapterStatus)
  );
}

async function refusalOf(response: Response): Promise<NotificationsFailure> {
  const parsed = await readBody(
    response,
    (value): value is { error: string } =>
      isObject(value) && typeof value.error === "string",
  );
  const code = parsed?.value.error;
  if (code !== undefined) {
    const known = KNOWN_FAILURES.find((entry) => entry === code);
    if (known !== undefined) return known;
  }
  if (response.status === 401) return "unauthenticated";
  if (response.status === 403) return "forbidden";
  if (response.status === 404) return "not_found";
  if (response.status === 400) return "bad_request";
  return "refused";
}

async function ask<T>(
  send: () => Promise<Response>,
  is: (value: unknown) => value is T,
): Promise<NotificationsAnswer<T>> {
  let response: Response;
  try {
    response = await send();
  } catch {
    // network refusal or offline link
    return { ok: false, code: "unreachable" };
  }
  if (!response.ok) return { ok: false, code: await refusalOf(response) };
  const parsed = await readBody(response, is);
  return parsed === null
    ? { ok: false, code: "refused" }
    : { ok: true, value: parsed.value };
}

/** Client-side address validation matching the server's strict destination rules. */
export function validateAddressInput(
  adapter: NotificationAdapter,
  raw: string,
):
  | { readonly ok: true; readonly address: string }
  | { readonly ok: false; readonly reason: AddressValidationError } {
  const trimmed = raw.trim();
  if (adapter === "email") {
    if (
      trimmed.length === 0 ||
      trimmed.length > EMAIL_LIMIT ||
      CONTROL_CHARS.test(trimmed) ||
      !EMAIL_PATTERN.test(trimmed)
    ) {
      return { ok: false, reason: "not_email_address" };
    }
    return { ok: true, address: trimmed };
  }

  if (
    trimmed.length === 0 ||
    trimmed.length > ADDRESS_LIMIT ||
    CONTROL_CHARS.test(trimmed) ||
    (!trimmed.startsWith("https://") && !trimmed.startsWith("http://"))
  ) {
    return { ok: false, reason: "not_web_address" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // malformed URL
    return { ok: false, reason: "not_web_address" };
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.hostname.length === 0
  ) {
    return { ok: false, reason: "not_web_address" };
  }

  if (adapter === "slack") {
    if (
      !trimmed.startsWith(SLACK_PREFIX) ||
      parsed.protocol !== "https:" ||
      parsed.hostname !== "hooks.slack.com" ||
      parsed.port !== "" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname.length <= 1
    ) {
      return { ok: false, reason: "not_slack_address" };
    }
  }

  return { ok: true, address: trimmed };
}

/** Creates the HTTP client for `/api/workspace/notifications*` over injected `fetch` and Bearer session token. */
export function createNotificationsApi(options: {
  readonly fetch: typeof fetch;
  readonly token: () => string | null;
}): NotificationsApi {
  const http = createHistoryHttp(options);
  return {
    get: (workspaceId) =>
      ask(
        () => http.get("/api/workspace/notifications", { workspaceId }),
        isNotificationsResponse,
      ),
    set: (workspaceId, adapter, address) =>
      ask(
        () =>
          http.post("/api/workspace/notifications/set", {
            workspaceId,
            adapter,
            address,
          }),
        isNotificationsResponse,
      ),
  };
}

export interface WorkspaceNotificationsCacheEntry {
  readonly adapters: readonly NotificationAdapterStatus[] | null;
  readonly loadError: boolean;
}

export interface WorkspaceNotificationsHolder {
  readonly state: Subscribable<WorkspaceNotificationsCacheEntry>;
  set(next: WorkspaceNotificationsCacheEntry): void;
}

const holders = new Map<string, WorkspaceNotificationsHolder>();

/** Per-page-load cached notifications status (holds server-masked hints only, never full saved addresses). */
export function workspaceNotificationsHolder(
  userId: string,
  workspaceId: string,
): WorkspaceNotificationsHolder {
  const key = `${userId}:${workspaceId}`;
  const existing = holders.get(key);
  if (existing !== undefined) return existing;
  const value = createValue<WorkspaceNotificationsCacheEntry>({
    adapters: null,
    loadError: false,
  });
  const holder: WorkspaceNotificationsHolder = {
    state: value,
    set: (next) => value.set(next),
  };
  holders.set(key, holder);
  return holder;
}
