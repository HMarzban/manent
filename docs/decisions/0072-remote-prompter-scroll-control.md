# 0072. Remote prompter scroll control uses a server-held operator lease and client-side interpolation

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Extending server-held room coordination (decision 0040), the shared prompter projection (decision 0050), and the 1-second heartbeat and 3-second feed-loss threshold (decision 0058), studio operators running a rundown need to play, pause, adjust scroll rate, nudge line by line, and cue a Prompter window remotely. Remote control must keep presenter scrolling smooth without flooding the sync socket or writing transient playback state into the synced CRDT document.

## Options considered

- Store playback state and scroll offsets inside the rundown CRDT document. Rejected: continuous playback updates would bloat CRDT history, trigger spurious saves, and mix ephemeral studio control with editorial content.
- Stream scroll positions from the operator browser over WebSockets at display refresh rates. Rejected: saturates the sync connection, couples presenter smoothness to network jitter, and does not enforce single-operator exclusivity.
- Hold an ephemeral per-rundown operator lease in server memory with a 30-second TTL, accept operator commands over HTTP POST, fan out `prompter_operator_changed` and `prompter_scroll` control frames over the existing open-union `CONTROL_KINDS` channel, and interpolate locally in `requestAnimationFrame`. Chosen.

## Decision

One studio operator holds an ephemeral scroll lease per rundown in server memory, gated by the `send_to_prompter` capability, compare-and-swap take and release, a 30-second TTL, automatic release on socket disconnect, and a per-`deviceId` check on every command. Operator commands (`play`, `pause`, `speed`, `cue`, `nudge`) arrive over HTTP POST and fan out as `prompter_operator_changed` and `prompter_scroll` control frames—leaving `PROTOCOL_VERSION` unchanged—to both prompter and rundown subscribers. Prompter windows interpolate scrolling locally in `requestAnimationFrame` against a smoothed server clock offset, halt immediately on `Feed lost`, and let a local presenter switch to `Free scroll` and back to `Follow` without revoking the operator lease.

## Consequences and trade-offs

- Presenters see smooth scrolling with minimal server traffic, zero CRDT churn, and full wire compatibility with earlier clients.
- Because the lease lives only in server memory, a server restart clears active control and the operator simply takes control again.
- Clock-offset smoothing bounds drift between operator and presenter browsers, though scroll-fanout latency at 200 concurrent viewers has not yet been measured in the benchmark suite.

## Revisit when

Multi-process server deployments require sharing operator leases across hosts, or studio workflows need simultaneous dual-operator hand-off without an explicit takeover.
