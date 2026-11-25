// Storage keys, strict destination validation, and non-leaking owner hints for notification adapters.
import type { NotificationAdapter } from "@manent/sync-protocol";

/** Workspace settings keys holding each adapter's saved destination address. */
export const NOTIFICATION_SETTING_KEYS: Readonly<
  Record<NotificationAdapter, string>
> = Object.freeze({
  webhook: "notifications.webhook_url",
  slack: "notifications.slack_url",
  email: "notifications.email_to",
});

const ADDRESS_LIMIT = 2048;
const EMAIL_LIMIT = 254;
const CONTROL_CHARS = new RegExp("[\\r\\n\\0]");
const EMAIL_PATTERN = new RegExp(
  '^[^\\s@<>(),;:"\\\\]+@[^\\s@<>(),;:"\\\\]+\\.[^\\s@<>(),;:"\\\\]{2,}$',
);
const SLACK_PREFIX = "https://hooks.slack.com/";
const MASK_SUFFIX_LENGTH = 4;

/**
 * Validates and normalises a destination address for `adapter`.
 * Returns the trimmed address when valid, or null when refused.
 */
export function validateNotificationAddress(
  adapter: NotificationAdapter,
  raw: string,
): string | null {
  if (raw.length === 0 || raw.length > ADDRESS_LIMIT || CONTROL_CHARS.test(raw))
    return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed !== raw) return null;

  if (adapter === "email") {
    if (trimmed.length > EMAIL_LIMIT || !EMAIL_PATTERN.test(trimmed))
      return null;
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // malformed URL
    return null;
  }

  if (adapter === "webhook") {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    return parsed.hostname.length > 0 ? trimmed : null;
  }

  // Slack incoming webhooks must strictly target https://hooks.slack.com/<path> with no userinfo or custom port
  if (
    !trimmed.startsWith(SLACK_PREFIX) ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== "hooks.slack.com" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname.length <= 1
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Produces a non-leaking owner hint for a saved address:
 * HTTP(S) URLs become `<host>/…<last4>`, emails become `…@<domain>`.
 */
export function hintForAddress(
  adapter: NotificationAdapter,
  saved: string,
): string | null {
  if (saved.length === 0) return null;
  if (adapter === "email") {
    const at = saved.lastIndexOf("@");
    if (at <= 0 || at === saved.length - 1) return "…";
    return `…@${saved.slice(at + 1)}`;
  }
  try {
    const parsed = new URL(saved);
    const tail = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const suffix =
      tail.length > MASK_SUFFIX_LENGTH ? tail.slice(-MASK_SUFFIX_LENGTH) : "";
    return `${parsed.host}/…${suffix}`;
  } catch {
    // fallback if a stored value is not parseable as a URL
    return saved.length > MASK_SUFFIX_LENGTH
      ? `…${saved.slice(-MASK_SUFFIX_LENGTH)}`
      : "…";
  }
}
