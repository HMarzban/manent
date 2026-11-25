// Outbound notification delivery worker: 10 s timeout, fixed backoff schedule, stop after 6th attempt.
import type { OutboxRow, OutboxStore } from "@manent/storage";
import type { NotificationAdapter } from "@manent/sync-protocol";

/** Retry backoff delays in milliseconds after attempts 1..5 (1, 5, 30, 120, 720 minutes). */
export const RETRY_DELAYS_MS: readonly number[] = Object.freeze([
  60_000, 300_000, 1_800_000, 7_200_000, 43_200_000,
]);

/** Default per-delivery HTTP timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Default batch size drained per tick. */
export const DEFAULT_DELIVER_BATCH = 25;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface DeliveryAdapters {
  /** Returns the current saved destination address for (workspaceId, adapter), or null when removed/off. */
  addressOf(workspaceId: string, adapter: NotificationAdapter): string | null;
  readonly resendApiKey: string | null;
  readonly resendFrom: string | null;
}

export interface DeliverDueOptions {
  readonly outbox: OutboxStore;
  readonly adapters: DeliveryAdapters;
  readonly now: () => number;
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly batchLimit?: number;
  readonly schedule?: (fn: () => void, delayMs: number) => () => void;
}

interface OutboundRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

function buildEmailRequest(
  to: string,
  payload: string,
  resendApiKey: string,
  resendFrom: string,
): OutboundRequest | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== "object" || parsed === null) return null;
    const subject: unknown = Reflect.get(parsed, "subject");
    const text: unknown = Reflect.get(parsed, "text");
    if (typeof subject !== "string" || typeof text !== "string") return null;
    return {
      url: RESEND_ENDPOINT,
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: resendFrom, to, subject, text }),
    };
  } catch {
    // malformed stored email payload cannot be delivered
    return null;
  }
}

function buildRequest(
  row: OutboxRow,
  adapters: DeliveryAdapters,
): { kind: "send"; request: OutboundRequest } | { kind: "drop" } {
  const address = adapters.addressOf(row.workspaceId, row.adapter);
  if (address === null || address.length === 0) return { kind: "drop" };
  if (row.adapter === "email") {
    if (
      adapters.resendApiKey === null ||
      adapters.resendApiKey.length === 0 ||
      adapters.resendFrom === null ||
      adapters.resendFrom.length === 0
    ) {
      return { kind: "drop" };
    }
    const request = buildEmailRequest(
      address,
      row.payload,
      adapters.resendApiKey,
      adapters.resendFrom,
    );
    return request === null ? { kind: "drop" } : { kind: "send", request };
  }
  return {
    kind: "send",
    request: {
      url: address,
      headers: { "Content-Type": "application/json" },
      body: row.payload,
    },
  };
}

function defaultSchedule(fn: () => void, delayMs: number): () => void {
  const timer = setTimeout(fn, delayMs);
  return () => clearTimeout(timer);
}

async function sendWithTimeout(
  fetchFn: typeof globalThis.fetch,
  request: OutboundRequest,
  timeoutMs: number,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<boolean> {
  const controller = new AbortController();
  const cancel = schedule(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    // network refusal or abort triggers retry schedule
    return false;
  } finally {
    cancel();
  }
}

/**
 * Drains up to `batchLimit` due rows from `outbox`.
 * 2xx marks delivered; any non-2xx, throw, or timeout retries with RETRY_DELAYS_MS and gives up after the 6th attempt.
 * Returns the number of rows processed.
 */
export async function deliverDue(options: DeliverDueOptions): Promise<number> {
  const { outbox, adapters, now } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const batchLimit = options.batchLimit ?? DEFAULT_DELIVER_BATCH;
  const schedule = options.schedule ?? defaultSchedule;
  const rows = outbox.due(batchLimit);
  for (const row of rows) {
    const built = buildRequest(row, adapters);
    if (built.kind === "drop") {
      outbox.delivered(row.id);
      continue;
    }
    const ok = await sendWithTimeout(
      options.fetch,
      built.request,
      timeoutMs,
      schedule,
    );
    if (ok) {
      outbox.delivered(row.id);
      continue;
    }
    const delay = RETRY_DELAYS_MS[row.attempts];
    if (delay === undefined) {
      outbox.giveUp(row.id);
    } else {
      outbox.retry(row.id, now() + delay);
    }
  }
  return rows.length;
}
