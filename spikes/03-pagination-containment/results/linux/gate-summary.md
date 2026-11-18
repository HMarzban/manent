# Pagination cost and typing at 120 pages under 6x CPU throttle

Written by `bun harness/bench.ts --summarise gate` from `gate.jsonl`: 120 pages in 100-block sections with `content-visibility: auto`, pagination on (`pg=1`) and off (`pg=0`), the two loaded in turn, load by load. In each load, at the start, the middle and the end of the document: the warm-up once, then the 44-keystroke sentence five times with no pause. Times are in ms.

Each interval is a 95 % percentile bootstrap interval (10,000 resamples, seed 1): loads are drawn first and keystrokes within each drawn load second, and the positions (and configurations) measured in one load are drawn together. A statistic is `within` only when its whole interval is at or under the budget, `over` only when the whole interval is above it, and otherwise `inconclusive`; `hard fail` marks a whole interval above the hard-fail figure.

| Row | Throttle | Load baseline | Loads | Position | Keystrokes | p50 | p95 | p99 | max | Per-load p50s | Dispatch p50 | Dispatch p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 120p-pg1 | 6x | 3.65 | 5 | start | 1100 | 6.9 | 11.7 | 16.7 | 37.1 | 6.4, 5.2, 7.2, 7.7, 7.3 | 0.3 | 2.5 |
| 120p-pg1 | 6x | 3.65 | 5 | middle | 1100 | 8.2 | 12.8 | 17.4 | 45.2 | 6.7, 5.8, 8, 8.9, 9.7 | 0.3 | 2.5 |
| 120p-pg1 | 6x | 3.65 | 5 | end | 1100 | 7 | 11.9 | 15.3 | 25.1 | 6.7, 7.3, 6.8, 7, 7.5 | 0.2 | 2.4 |
| 120p-pg0 | 6x | 3.65 | 5 | start | 1100 | 6.7 | 10.9 | 13.7 | 26.5 | 6.2, 6.3, 6.8, 7.3, 7 | 0.2 | 1.9 |
| 120p-pg0 | 6x | 3.65 | 5 | middle | 1100 | 7.8 | 12.2 | 15.8 | 21.2 | 7.5, 7.7, 7.8, 8.2, 7.9 | 0.2 | 2.2 |
| 120p-pg0 | 6x | 3.65 | 5 | end | 1100 | 6.8 | 11.2 | 15.5 | 36.8 | 7.1, 7.2, 6.5, 6.9, 6.5 | 0.1 | 1.9 |

## Criterion 1: pagination adds no more than 4 ms (p95) of main-thread time per keystroke

Inside each resample, at each position, the p95 of the time inside `view.dispatch` with pagination minus the same without; the largest of the three positions.

| Statistic | Value | 95 % interval | Budget | Against the budget |
| --- | --- | --- | --- | --- |
| Added dispatch p95, worst position | 0.6 ms | 0.4 ms – 1.3 ms | ≤ 4 ms (hard fail > 8 ms) | within |

Reported beside it, not deciding:

| Statistic | Value | 95 % interval |
| --- | --- | --- |
| Engine plus decoration time per keystroke, p95 | 1.7 ms | 1.2 ms – 1.8 ms |
| Dispatch p95 with pagination, worst position | 2.5 ms | 2.4 ms – 3.1 ms |
| Added keystroke-to-frame p95, worst position | 0.8 ms | 0.2 ms – 2.2 ms |

Criterion 1: **pass**.

## Criterion 2: typing is inside the typing budget

Keystroke to next frame, the `120p-pg1` row.

| Statistic | Value | 95 % interval | Budget | Against the budget |
| --- | --- | --- | --- | --- |
| p50, worst position | 8.2 ms | 6.9 ms – 9.1 ms | ≤ 16 ms (hard fail > 33 ms) | within |
| p95, worst position | 12.8 ms | 11.7 ms – 13.9 ms | ≤ 33 ms (hard fail > 50 ms) | within |
| p99, worst position | 17.4 ms | 15.7 ms – 22.3 ms | ≤ 50 ms (hard fail > 100 ms) | within |
| Variation of p50 across start, middle and end | 18.8 % | 9.4 % – 28.2 % | ≤ 20 % (hard fail > 50 %) | inconclusive |

Criterion 2: **inconclusive**.
