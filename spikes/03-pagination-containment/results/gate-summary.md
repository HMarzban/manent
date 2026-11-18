# Pagination cost and typing at 120 pages under 6x CPU throttle

Written by `bun harness/bench.ts --summarise gate` from `gate.jsonl`: 120 pages in 100-block sections with `content-visibility: auto`, pagination on (`pg=1`) and off (`pg=0`), the two loaded in turn, load by load. In each load, at the start, the middle and the end of the document: the warm-up once, then the 44-keystroke sentence five times with no pause. Times are in ms.

Each interval is a 95 % percentile bootstrap interval (10,000 resamples, seed 1): loads are drawn first and keystrokes within each drawn load second, and the positions (and configurations) measured in one load are drawn together. A statistic is `within` only when its whole interval is at or under the budget, `over` only when the whole interval is above it, and otherwise `inconclusive`; `hard fail` marks a whole interval above the hard-fail figure.

| Row | Throttle | Load baseline | Loads | Position | Keystrokes | p50 | p95 | p99 | max | Per-load p50s | Dispatch p50 | Dispatch p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 120p-pg1 | 6x | 3.68 | 5 | start | 1100 | 5 | 6.5 | 7.3 | 20.5 | 4.5, 4.7, 5.3, 5.5, 4.9 | 1 | 2 |
| 120p-pg1 | 6x | 3.68 | 5 | middle | 1100 | 5.8 | 7.4 | 9 | 19.6 | 5.1, 5.5, 6.2, 6.3, 5.1 | 1.1 | 2 |
| 120p-pg1 | 6x | 3.68 | 5 | end | 1100 | 4.7 | 6.2 | 6.7 | 20.8 | 4.2, 4.6, 5, 5, 5 | 0.9 | 1.8 |
| 120p-pg0 | 6x | 3.68 | 5 | start | 1100 | 5 | 6.5 | 8.3 | 22.4 | 4.3, 5.5, 5.4, 5.1, 4.6 | 0.7 | 1.7 |
| 120p-pg0 | 6x | 3.68 | 5 | middle | 1100 | 5.6 | 7 | 8.2 | 9.8 | 5.4, 6, 5.8, 5.7, 4.9 | 0.8 | 1.6 |
| 120p-pg0 | 6x | 3.68 | 5 | end | 1100 | 4.8 | 6.1 | 6.6 | 21.9 | 4.3, 4.9, 4.8, 4.9, 4.7 | 0.5 | 1.5 |

## Criterion 1: pagination adds no more than 4 ms (p95) of main-thread time per keystroke

Inside each resample, at each position, the p95 of the time inside `view.dispatch` with pagination minus the same without; the largest of the three positions.

| Statistic | Value | 95 % interval | Budget | Against the budget |
| --- | --- | --- | --- | --- |
| Added dispatch p95, worst position | 0.4 ms | 0.3 ms – 0.6 ms | ≤ 4 ms (hard fail > 8 ms) | within |

Reported beside it, not deciding:

| Statistic | Value | 95 % interval |
| --- | --- | --- |
| Engine plus decoration time per keystroke, p95 | 1.3 ms | 1.3 ms – 1.4 ms |
| Dispatch p95 with pagination, worst position | 2 ms | 1.9 ms – 2.2 ms |
| Added keystroke-to-frame p95, worst position | 0.4 ms | 0 ms – 0.6 ms |

Criterion 1: **pass**.

## Criterion 2: typing is inside the typing budget

Keystroke to next frame, the `120p-pg1` row.

| Statistic | Value | 95 % interval | Budget | Against the budget |
| --- | --- | --- | --- | --- |
| p50, worst position | 5.8 ms | 5.2 ms – 6.2 ms | ≤ 16 ms (hard fail > 33 ms) | within |
| p95, worst position | 7.4 ms | 6.9 ms – 7.5 ms | ≤ 33 ms (hard fail > 50 ms) | within |
| p99, worst position | 9 ms | 7.9 ms – 11.5 ms | ≤ 50 ms (hard fail > 100 ms) | within |
| Variation of p50 across start, middle and end | 23.4 % | 12 % – 27.7 % | ≤ 20 % (hard fail > 50 %) | inconclusive |

Criterion 2: **inconclusive**.
