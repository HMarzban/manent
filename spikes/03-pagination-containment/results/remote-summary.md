# Typing with a remote editor through y-prosemirror 1.3.7

Written by `bun harness/remote.ts --summarise` from `remote.jsonl`. 100-block sections with `content-visibility: auto` and pagination, bound to a Y.Doc, a second peer in the same page whose edits arrive as remote updates; Chromium on this machine under its CPU throttle. Per fresh load, in the middle of the document: local typing alone (solo), then the same typing while the peer inserts one character every 100 ms near the top (with peer). 3 loads × 44 keystrokes per leg; 5 loads × 220 keystrokes at 120 pages and 6x. Times are in ms.

Rows not run: none.

## Extra keystroke-to-frame p95 with a remote editor

With-peer p95 minus solo p95, and its 95 % percentile bootstrap interval (10,000 resamples, seed 1; the same loads drawn for both legs, then keystrokes within each). The project's budget for typing with remote editors: extra p95 over solo ≤ 8 ms (hard fail > 16 ms). Not a pass criterion here: an interval wholly over the budget is the signal that the binding needs replacing.

| Pages | Throttle | Load baseline | Loads | Solo p50 / p95 / p99 | With peer p50 / p95 / p99 | Extra p95 | 95 % interval | Against the budget |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 120 | 1x | 2.46 | 3 | 2.1 / 4 / 4.4 | 2.6 / 3.8 / 4.1 | -0.2 | -0.6 – 0.2 | within |
| 120 | 4x | 2.46 | 3 | 3.4 / 5.2 / 5.5 | 3.4 / 5 / 6.5 | -0.2 | -1.1 – 0.4 | within |
| 120 | 6x | 2.46 | 5 | 5.7 / 7.9 / 9.2 | 5.8 / 7.8 / 9 | -0.1 | -0.4 – 0.4 | within |
| 1000 | 1x | 2.46 | 3 | 3 / 4.8 / 5.1 | 3.1 / 4.6 / 15.7 | -0.2 | -0.6 – 0.9 | within |
| 1000 | 4x | 2.46 | 3 | 5 / 6.1 / 7.3 | 4.4 / 5.5 / 6 | -0.6 | -1.7 – -0.1 | within |
| 1000 | 6x | 2.46 | 3 | 8.4 / 10.5 / 12.2 | 7.8 / 9.7 / 11.4 | -0.8 | -2.4 – 0.9 | within |
| 2000 | 1x | 2.46 | 3 | 3.6 / 5.7 / 6.4 | 3.5 / 5.9 / 6.2 | 0.2 | -1 – 0.7 | within |
| 2000 | 4x | 2.46 | 3 | 6.9 / 8.4 / 8.9 | 6.2 / 7.4 / 8.5 | -1 | -1.6 – 0 | within |
| 2000 | 6x | 2.46 | 3 | 7.9 / 10.2 / 10.6 | 6.6 / 9.7 / 10.5 | -0.5 | -1.6 – 0.8 | within |

No interval is wholly over the budget: nothing here signals that the binding needs replacing.

## Remote update cost against document size

The peer types 25 characters, one per frame, at 2 %, 50 % and 98 % of the blocks; the first five of each are dropped. Sync: applying the update through the binding and the pagination plugin, to the end of the transaction. Frame: to the next frame after it. For comparison, an earlier flat document (no sections) bound the same way cost about 9 ms per remote update at 1,000 pages, 1x, growing with the whole document.

| Pages | Throttle | Load baseline | Sync p50 / p95 at the start | in the middle | at the end | Frame p95 at the start | in the middle | at the end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 120 | 1x | 2.46 | 0.5 / 0.8 | 0.4 / 1 | 0.5 / 0.8 | 17.5 | 17.5 | 17.5 |
| 120 | 4x | 2.46 | 0.4 / 0.8 | 0.8 / 1.2 | 0.4 / 0.9 | 17.5 | 17.5 | 17.7 |
| 120 | 6x | 2.46 | 0.8 / 1.7 | 1.3 / 2.7 | 0.8 / 2.3 | 17.5 | 18.3 | 17.8 |
| 1000 | 1x | 2.46 | 0.4 / 1.1 | 0.7 / 1.3 | 0.4 / 1.2 | 17.6 | 17.7 | 17.5 |
| 1000 | 4x | 2.46 | 0.7 / 1.9 | 1.1 / 1.7 | 0.8 / 3.6 | 17.8 | 17.8 | 18 |
| 1000 | 6x | 2.46 | 1.3 / 2.8 | 1.8 / 3.8 | 1.5 / 5.6 | 17.9 | 18.1 | 18.4 |
| 2000 | 1x | 2.46 | 1.2 / 1.8 | 0.8 / 1.6 | 1.2 / 2.1 | 17.5 | 17.6 | 17.4 |
| 2000 | 4x | 2.46 | 1.3 / 2.5 | 1.9 / 3.6 | 1.6 / 3.3 | 17.7 | 17.8 | 17.6 |
| 2000 | 6x | 2.46 | 1.8 / 3.7 | 1.9 / 3.1 | 1.5 / 3 | 17.8 | 17.9 | 18.2 |

## A burst of 20 remote edits, and how much of the view each update touches

The burst: 20 peer inserts in 20 blocks spread over the document, applied back to back (separate), then 20 more merged into one update (merged); medians over the loads. Changed sections: the most sections whose node changed in one remote transaction. View updates per remote: section views updated per remote typing update. Both are expected to be 1.

| Pages | Throttle | Load baseline | Separate: sync / frame | Merged: sync / frame | Changed sections | View updates per remote |
| --- | --- | --- | --- | --- | --- | --- |
| 120 | 1x | 2.46 | 5.9 / 12.1 | 2.7 / 14.8 | 1 | 1 |
| 120 | 4x | 2.46 | 8.2 / 15.1 | 5 / 14.6 | 1 | 1 |
| 120 | 6x | 2.46 | 11.4 / 14.3 | 8 / 12.7 | 1 | 1 |
| 1000 | 1x | 2.46 | 8.8 / 11.5 | 7.3 / 16.2 | 1 | 1.05 |
| 1000 | 4x | 2.46 | 13.8 / 14.4 | 16.5 / 16.6 | 1 | 1.05 |
| 1000 | 6x | 2.46 | 24.1 / 25.4 | 26.4 / 32 | 1 | 1.05 |
| 2000 | 1x | 2.46 | 10.1 / 12.9 | 13.1 / 15.7 | 1 | 1 |
| 2000 | 4x | 2.46 | 19.9 / 20.7 | 39.2 / 39.7 | 1 | 1 |
| 2000 | 6x | 2.46 | 34.1 / 44.1 | 53 / 54.6 | 1 | 1 |
