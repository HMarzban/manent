# 0065. The public API authenticates workspace API keys only, read-only and scoped

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Studios want external build scripts and pipeline tools to list workspace folders and fetch script lines, clean Final Draft XML or compiled Ink JSON over HTTP without signing in as a person or gaining write access to live documents, Trash or Private scripts.

## Options considered

- Allow normal user session tokens on `/api/v1/*` alongside API keys. Rejected: blurs interactive user sessions with unattended automation, widens blast radius if a browser session leaks, and makes per-key revocation and rate limiting inconsistent.
- Give API keys read-write access to scripts and workspace metadata. Rejected: bypasses collaborative CRDT editing, undo history and human attribution for no immediate studio requirement.
- Authenticate `/api/v1/*` strictly with workspace API keys (`mk_` prefix, stored only as SHA-256 hashes), enforce a per-key rate limit, and restrict every endpoint to read-only access over live, non-trashed, non-Private documents in the key's workspace. Chosen.

## Decision

The public REST API (`/api/v1/{folder,lines,fdx,ink}`) accepts only `Authorization: Bearer mk_…` workspace API keys created by workspace owners, refuses user session tokens with `401`, stores keys only as SHA-256 hashes after displaying the plaintext once, enforces a per-key token bucket of 1 request per second sustained with a burst of 30 (`429` with whole-second `Retry-After`, dropped on revocation), and verifies every lookup against server-held directory state to exclude Trash, Private (`user:`) homes and other workspaces (`404`).

## Consequences and trade-offs

- Pipeline tools can automate exports safely without risking accidental script edits or cross-workspace data exposure, and revoking a compromised API key takes effect immediately.
- Read-only scope means automated importers or write integrations must wait for a future scoped write API rather than reusing these keys.
- Per-key rate-limit buckets are held in server memory, which fits the single-process server architecture today and resets across server restarts.

## Revisit when

External studio tools need scoped write endpoints or multi-process hosted deployments require shared rate-limit state across servers.
