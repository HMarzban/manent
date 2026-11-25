# 0065. Workspace notifications deliver from a persistent outbox off the write path

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Teams want comment activity (`thread_opened`, `reply_added`, `person_mentioned`) on workspace scripts to notify a custom webhook, a Slack channel or a Resend email recipient without slowing down comment commits, losing deliveries on brief network blips, exposing Private documents or leaking saved webhook URLs back to the browser.

## Options considered

- Send HTTP requests to webhooks, Slack and Resend synchronously inside the comment commit handler. Rejected: slow or unreachable external endpoints would stall comment saves and drop notifications whenever a destination blips.
- Store full destination URLs and Resend credentials inside each outbox row and pre-fill saved addresses in Workspace settings. Rejected: increases credential exposure in storage and lets anyone viewing Workspace settings copy secret incoming-webhook URLs.
- Enqueue comment events into a persistent SQLite outbox off the write path, deliver asynchronously with bounded retry backoff, mask saved destination addresses as hints after saving, and gate email delivery on server environment variables for one owner-chosen recipient address. Chosen.

## Decision

Comment commits on live workspace scripts—never on Private (`user:`) documents—enqueue rows into a persistent SQLite outbox (`packages/server-core/src/notifications/`). A background worker drains due rows with a 10-second per-attempt timeout and retry backoff of 1, 5, 30, 120 and 720 minutes (stopping after 6 tries). Workspace settings never returns full saved addresses after saving (showing only server-masked hints), email delivery requires both `MANENT_RESEND_API_KEY` and `MANENT_RESEND_FROM` on the server for one owner-chosen recipient address, and outbox rows store only the formatted payload without credentials.

## Consequences and trade-offs

- Comment saves remain fast and resilient to slow or offline notification targets, and saved webhook or Slack URLs cannot be read back through the browser interface.
- Email is limited to one owner-configured workspace recipient address rather than per-person notification subscriptions in this build.
- Slack delivery is built against Slack's public incoming-webhook format (`https://hooks.slack.com/…`) and has not been verified against a real Slack workspace.

## Revisit when

Hosted deployments add per-user notification preferences and verified email accounts, or real-workspace Slack testing reveals formatting or rate-limit adjustments.
