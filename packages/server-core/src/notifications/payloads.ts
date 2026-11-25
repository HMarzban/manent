// Outbound webhook, Slack, and Resend email payload formatters.
import type {
  NotificationAdapter,
  NotificationEventType,
} from "@manent/sync-protocol";

/** Structured comment event enqueued for outbound notification adapters. */
export interface NotificationEvent {
  readonly type: NotificationEventType;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly docId: string;
  readonly title: string;
  readonly threadId: string;
  readonly itemId: string;
  readonly authorUserId: string;
  readonly authorName: string;
  readonly mentionedUserIds: readonly string[];
  readonly mentionedNames: readonly string[];
  readonly text: string;
  readonly url: string;
  readonly at: number;
}

/** Joins display names with commas and "and" ("A", "A and B", "A, B and C"). */
export function joinMentionedNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]!} and ${names[1]!}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}

function headlineOf(event: NotificationEvent): string {
  switch (event.type) {
    case "thread_opened":
      return `${event.authorName} commented on '${event.title}'`;
    case "reply_added":
      return `${event.authorName} replied on '${event.title}'`;
    case "person_mentioned":
      return `${event.authorName} mentioned ${joinMentionedNames(event.mentionedNames)} on '${event.title}'`;
    default: {
      const unreachable: never = event.type;
      return unreachable;
    }
  }
}

/** Formats the JSON body posted to a custom webhook endpoint. */
export function formatWebhookPayload(event: NotificationEvent): string {
  return JSON.stringify({
    type: event.type,
    workspaceId: event.workspaceId,
    docId: event.docId,
    title: event.title,
    threadId: event.threadId,
    itemId: event.itemId,
    authorUserId: event.authorUserId,
    authorName: event.authorName,
    mentionedUserIds: [...event.mentionedUserIds],
    text: event.text,
    url: event.url,
    at: event.at,
  });
}

/** Formats the Slack incoming-webhook JSON body (`{ text }`). */
export function formatSlackPayload(event: NotificationEvent): string {
  const text = `${headlineOf(event)}:\n"${event.text}"\n${event.url}`;
  return JSON.stringify({ text });
}

/** Formats the stored outbox payload for Resend email delivery (`{ subject, text }`, never holding credentials). */
export function formatEmailPayload(event: NotificationEvent): string {
  const subject = headlineOf(event);
  const text = [
    `${subject} in ${event.workspaceName}:`,
    `"${event.text}"`,
    `Open it in Manent: ${event.url}`,
    `You get this because an owner of ${event.workspaceName} chose this address for its comments in Workspace settings → Notifications.`,
  ].join("\n\n");
  return JSON.stringify({ subject, text });
}

/** Formats the outbox payload for the given adapter. */
export function formatAdapterPayload(
  adapter: NotificationAdapter,
  event: NotificationEvent,
): string {
  switch (adapter) {
    case "webhook":
      return formatWebhookPayload(event);
    case "slack":
      return formatSlackPayload(event);
    case "email":
      return formatEmailPayload(event);
    default: {
      const unreachable: never = adapter;
      return unreachable;
    }
  }
}
