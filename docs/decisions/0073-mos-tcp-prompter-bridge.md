# 0073. External MOS prompters connect through a PrompterFeedHub-only TCP bridge

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Extending the single prompter projection (decision 0050), automatic two-second sends (decision 0055), and the air-window boundary (decision 0056)—while keeping plain-text prompter files (decision 0057) intact—broadcast newsrooms and live shows drive external hardware prompters over MOS 2.8.5 TCP (including Autoscript WinPlus-IP) on private studio networks. Outbound TCP connections from the server must guard against server-side request forgery and must never bypass the air window by reading unsent live CRDT edits.

## Options considered

- Adopt a third-party XML parser and read live rundown CRDT documents directly to assemble MOS running orders. Rejected: adds external XML parser risks such as entity expansion, and reading live CRDT state directly would leak unsent copy during the air window.
- Replace plain-text prompter file output with MOS TCP delivery alone. Rejected: studios without a networked MOS prompter continue to rely on plain-text prompter files from decision 0057.
- Implement a zero-dependency pure-JS UTF-16BE XML codec in `@manent/formats` and a `node:net` TCP bridge in `@manent/server-core` (re-exported to `@manent/local-node` for optional desktop LAN relay) that subscribes strictly to `PrompterFeedHub`, enforces DNS pinning and a `net.BlockList` allowlist, and requires per-rundown opt-in. Chosen.

## Decision

External MOS 2.8.5 prompters, including Autoscript WinPlus-IP, connect through a zero-dependency pure-JS UTF-16BE XML codec in `@manent/formats` (rejecting `<!DOCTYPE>`, `<!ENTITY>`, and processing instructions with bounded nesting depth and payload size) and a `node:net` TCP bridge in `@manent/server-core`, re-exported to `@manent/local-node` for optional desktop LAN relay with no new package boundary edges. The bridge subscribes strictly to `PrompterFeedHub` so air-window and decision 0050 spoken-text rules hold identically, pins DNS resolution against a private and loopback `net.BlockList` allowlist that denies cloud metadata endpoints and IPv4-mapped IPv6 bypasses, requires per-rundown opt-in gated by `edit_rundowns` and `send_to_prompter`, and is verified against an in-process mock MOS TCP harness in `@manent/testkit`.

## Consequences and trade-offs

- External hardware prompters receive the exact same spoken text and air-window protection as the built-in Prompter window, while plain-text prompter files remain untouched.
- Owning a minimal UTF-16BE XML codec keeps external dependencies at zero and blocks entity expansion, at the cost of handling only the MOS message subset needed for prompter running orders.
- Automated verification runs against the in-process mock MOS TCP harness; behaviour against physical studio prompter hardware has not been measured in automated checks.

## Revisit when

Broadcast rooms require bidirectional MOS rundown ownership—such as external story reordering or graphics-system automation—beyond one-way prompter delivery.
