# 0058. Prompter feeds heartbeat every second and report feed loss after three seconds

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

An operator running a Prompter window during a live broadcast must know promptly when the feed stops so a presenter does not read stale copy assuming it is live. The general sync connection's 10-second `PING` interval is too slow for live operations, while flagging a feed drop after a single missed second would cause false alarms on brief jitter.

## Options considered

- Rely on the sync socket's 10-second `PING` cadence. Rejected: up to ten seconds of silent staleness is too slow for a live studio operator.
- Flag feed loss after 1 second without a frame. Rejected: a single delayed packet or brief scheduling hiccup would flicker "Feed lost" on screen.
- Broadcast a 1-second heartbeat `VIEW_PATCH` from the server and report "Feed lost" in the Prompter window after 3 seconds without a feed frame. Chosen.

## Decision

While a rundown has active prompter subscribers, `createPrompterFeedHub` sends a pre-encoded empty heartbeat `VIEW_PATCH` every 1 s (`HEARTBEAT_MS = 1_000`). On the client, `PrompterFeedClient` transitions the feed status to `lost` ("Feed lost hh:mm:ss — showing last received") after 3 s (`FEED_LOSS_MS = 3_000`) without receiving a snapshot or patch, probes the socket, and returns to `Live` automatically without a reload once frames resume.

## Consequences and trade-offs

- Operators see feed loss within three seconds while the last received text stays visible on screen, and one delayed heartbeat never causes a false alarm.
- Heartbeat payloads are pre-encoded once (`HEARTBEAT_BYTES`) and prepared once per broadcast (`prepareMessage`), keeping per-broadcast encoding constant across subscribers, though every active prompter connection still receives one small frame per second while idle.
- Prompter feed staleness and fan-out latency at 200 concurrent viewers have not yet been measured in the benchmark suite.

## Revisit when

Benchmark runs at full newsroom viewer scale show 1-second heartbeats consume significant server CPU or bandwidth, or live studio use calls for a different threshold.
