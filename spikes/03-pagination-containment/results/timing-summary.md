# Timing figures beside the budgets

Written by `bun harness/bench.ts --summarise timing`. Chromium on this machine under its CPU throttle unless a table says otherwise; 100-block sections with `content-visibility: auto` and pagination on unless the row says otherwise (`nocv`: the same sections without containment; `flat`: no sections, no pagination). Each figure stands beside the project's budget where one exists; none of them is a pass criterion. Times are in ms unless stated.

## Typing rows

Keystroke to next frame at each position, 44 keystrokes per load and position after the warm-up. Sources: `matrix.jsonl`, `fallback.jsonl`, `sweep.jsonl`, `zoom.jsonl`.

| Row | Throttle | Load baseline | Loads | Position | Keystrokes | p50 | p95 | p99 | max | Per-load p50s | Dispatch p50 | Dispatch p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 120p-pg1 | 1x | 3.84 | 3 | start | 132 | 1.5 | 3.2 | 3.5 | 3.5 | 2.2, 2, 0.8 | 0.3 | 0.8 |
| 120p-pg1 | 1x | 3.84 | 3 | middle | 132 | 1 | 3 | 3.4 | 4.2 | 2.5, 0.9, 1 | 0.2 | 0.6 |
| 120p-pg1 | 1x | 3.84 | 3 | end | 132 | 0.8 | 2.7 | 2.9 | 5 | 2.2, 0.8, 0.7 | 0.2 | 0.5 |
| 120p-pg1 | 4x | 3.84 | 3 | start | 132 | 3.6 | 4.7 | 4.9 | 14.5 | 3.5, 3.9, 3.5 | 0.8 | 1.4 |
| 120p-pg1 | 4x | 3.84 | 3 | middle | 132 | 3.9 | 4.7 | 5.4 | 5.7 | 3.9, 4.2, 3.1 | 0.7 | 1.3 |
| 120p-pg1 | 4x | 3.84 | 3 | end | 132 | 3.2 | 4 | 4.4 | 4.4 | 3, 3.6, 2.8 | 0.5 | 1.1 |
| 120p-pg1 | 6x | 3.84 | 3 | start | 132 | 4.6 | 6.2 | 6.8 | 7.2 | 4.5, 4.9, 4.4 | 1.1 | 2 |
| 120p-pg1 | 6x | 3.84 | 3 | middle | 132 | 5.3 | 6.9 | 7.6 | 9.4 | 5.3, 5.3, 5.5 | 0.9 | 1.9 |
| 120p-pg1 | 6x | 3.84 | 3 | end | 132 | 4.3 | 5.7 | 6.8 | 8 | 4.3, 4.3, 4.4 | 0.8 | 1.6 |
| 120p-pg0 | 1x | 3.84 | 3 | start | 132 | 2.1 | 2.8 | 3.1 | 3.2 | 2.3, 2.2, 1 | 0.3 | 0.5 |
| 120p-pg0 | 1x | 3.84 | 3 | middle | 132 | 2.5 | 3.3 | 3.4 | 18.7 | 2.5, 2.4, 2.6 | 0.3 | 0.5 |
| 120p-pg0 | 1x | 3.84 | 3 | end | 132 | 1.9 | 2.8 | 3.3 | 20.5 | 2.1, 0.7, 2.3 | 0.2 | 0.4 |
| 120p-pg0 | 4x | 3.84 | 3 | start | 132 | 3.3 | 4.2 | 4.5 | 4.6 | 3.6, 3.4, 2.9 | 0.6 | 1.1 |
| 120p-pg0 | 4x | 3.84 | 3 | middle | 132 | 3.8 | 4.8 | 6.5 | 17.2 | 4.2, 3.8, 3.4 | 0.3 | 1 |
| 120p-pg0 | 4x | 3.84 | 3 | end | 132 | 2.9 | 3.8 | 4.6 | 4.7 | 3.2, 2.7, 2.7 | 0.2 | 0.9 |
| 120p-pg0 | 6x | 3.84 | 3 | start | 132 | 4.6 | 6.6 | 6.9 | 9.1 | 5, 4.3, 4.5 | 0.7 | 1.9 |
| 120p-pg0 | 6x | 3.84 | 3 | middle | 132 | 5.4 | 7 | 7.8 | 9.2 | 6.1, 4.4, 5.4 | 0.8 | 1.6 |
| 120p-pg0 | 6x | 3.84 | 3 | end | 132 | 4 | 5.5 | 6.8 | 6.8 | 4.3, 3.5, 4.3 | 0.2 | 1.5 |
| 1000p-pg1 | 1x | 3.84 | 3 | start | 132 | 2.9 | 3.5 | 4.3 | 7.9 | 2.9, 2.7, 3 | 0.7 | 0.9 |
| 1000p-pg1 | 1x | 3.84 | 3 | middle | 132 | 2.5 | 3.7 | 4.1 | 4.3 | 3, 3.1, 1.2 | 0.5 | 0.9 |
| 1000p-pg1 | 1x | 3.84 | 3 | end | 132 | 1.9 | 3.9 | 4.1 | 4.7 | 2.2, 3.1, 1.3 | 0.6 | 1.3 |
| 1000p-pg1 | 4x | 3.84 | 3 | start | 132 | 3.9 | 4.9 | 5.5 | 5.8 | 3.8, 3.8, 4.1 | 0.9 | 1.5 |
| 1000p-pg1 | 4x | 3.84 | 3 | middle | 132 | 4.2 | 5.4 | 6.7 | 7 | 4.1, 4, 4.4 | 0.9 | 1.4 |
| 1000p-pg1 | 4x | 3.84 | 3 | end | 132 | 4.8 | 6.3 | 7 | 7.1 | 4.5, 5.1, 5 | 1.4 | 2.2 |
| 1000p-pg1 | 6x | 3.84 | 3 | start | 132 | 5.9 | 7.5 | 8.1 | 8.2 | 6.4, 5.9, 5.6 | 1.4 | 2.3 |
| 1000p-pg1 | 6x | 3.84 | 3 | middle | 132 | 7.2 | 9.1 | 10 | 12.1 | 8, 7.1, 6.4 | 1.5 | 2.4 |
| 1000p-pg1 | 6x | 3.84 | 3 | end | 132 | 7.3 | 9.5 | 10 | 12 | 8.2, 7.1, 6.8 | 2.1 | 3.7 |
| 1000p-pg0 | 1x | 3.84 | 3 | start | 132 | 2.7 | 3.3 | 3.9 | 9.7 | 2.6, 2.6, 2.7 | 0.5 | 0.7 |
| 1000p-pg0 | 1x | 3.84 | 3 | middle | 132 | 3 | 3.8 | 4.3 | 4.9 | 3.1, 3, 3 | 0.4 | 0.7 |
| 1000p-pg0 | 1x | 3.84 | 3 | end | 132 | 2.4 | 3 | 3.2 | 3.4 | 2.3, 2.4, 2.5 | 0.3 | 0.5 |
| 1000p-pg0 | 4x | 3.84 | 3 | start | 132 | 3.8 | 4.6 | 18.5 | 18.8 | 3.8, 3.3, 4.1 | 0.7 | 1.1 |
| 1000p-pg0 | 4x | 3.84 | 3 | middle | 132 | 4.5 | 5.5 | 6.6 | 6.8 | 4.7, 4.5, 4.3 | 0.7 | 1.2 |
| 1000p-pg0 | 4x | 3.84 | 3 | end | 132 | 3.5 | 4.4 | 6.4 | 15.3 | 3.3, 3.9, 3.3 | 0.5 | 1 |
| 1000p-pg0 | 6x | 3.84 | 3 | start | 132 | 5.7 | 7.5 | 8.7 | 9.9 | 5.3, 5.2, 6.7 | 1.1 | 1.7 |
| 1000p-pg0 | 6x | 3.84 | 3 | middle | 132 | 6.9 | 8.5 | 16.6 | 22 | 6.4, 7.2, 7.1 | 1.1 | 2 |
| 1000p-pg0 | 6x | 3.84 | 3 | end | 132 | 5.6 | 7.3 | 8 | 8.1 | 4.9, 6.4, 5.4 | 0.7 | 1.4 |
| 2000p-pg1 | 1x | 3.84 | 3 | start | 132 | 3.4 | 4.6 | 5.1 | 9.8 | 3.5, 3.6, 3 | 0.9 | 1.5 |
| 2000p-pg1 | 1x | 3.84 | 3 | middle | 132 | 3.3 | 4.8 | 5.3 | 5.5 | 4.1, 1.5, 3.5 | 0.7 | 1.1 |
| 2000p-pg1 | 1x | 3.84 | 3 | end | 132 | 3.1 | 4.1 | 4.5 | 4.6 | 3.3, 1.2, 3.4 | 0.7 | 1.1 |
| 2000p-pg1 | 4x | 3.84 | 3 | start | 132 | 5 | 6.1 | 6.8 | 7 | 4.4, 4.7, 5.5 | 1.2 | 2.3 |
| 2000p-pg1 | 4x | 3.84 | 3 | middle | 132 | 6.2 | 7.4 | 10.4 | 20.6 | 5.5, 6.5, 6.4 | 1.2 | 1.8 |
| 2000p-pg1 | 4x | 3.84 | 3 | end | 132 | 4.8 | 5.8 | 6.5 | 6.6 | 4.6, 4.9, 4.8 | 1 | 2 |
| 2000p-pg1 | 6x | 3.84 | 3 | start | 132 | 6.8 | 9 | 9.6 | 9.7 | 7.2, 6.5, 6.8 | 1.7 | 2.9 |
| 2000p-pg1 | 6x | 3.84 | 3 | middle | 132 | 8.3 | 9.9 | 12.7 | 12.9 | 8.4, 8.4, 8.1 | 1.6 | 2.7 |
| 2000p-pg1 | 6x | 3.84 | 3 | end | 132 | 6.5 | 8.3 | 8.8 | 8.9 | 6.3, 6.4, 6.9 | 1.4 | 2.6 |
| 2000p-pg0 | 1x | 3.84 | 3 | start | 132 | 3 | 3.8 | 4.2 | 19.2 | 3.1, 3.2, 3 | 0.5 | 0.8 |
| 2000p-pg0 | 1x | 3.84 | 3 | middle | 132 | 4.1 | 5.1 | 5.4 | 7.1 | 3.9, 4.2, 4.1 | 0.5 | 0.7 |
| 2000p-pg0 | 1x | 3.84 | 3 | end | 132 | 2.8 | 3.6 | 3.7 | 3.8 | 2.9, 2.7, 2.8 | 0.4 | 0.6 |
| 2000p-pg0 | 4x | 3.84 | 3 | start | 132 | 4.2 | 5.1 | 5.5 | 9.7 | 4.1, 4.3, 4 | 0.7 | 1.2 |
| 2000p-pg0 | 4x | 3.84 | 3 | middle | 132 | 5.5 | 6.6 | 7.6 | 7.6 | 5.1, 5.8, 5.6 | 0.6 | 1.2 |
| 2000p-pg0 | 4x | 3.84 | 3 | end | 132 | 3.8 | 4.8 | 5.1 | 5.9 | 4.1, 3.7, 3.8 | 0.5 | 1 |
| 2000p-pg0 | 6x | 3.84 | 3 | start | 132 | 6.1 | 7.5 | 8.1 | 8.4 | 6.1, 6, 6.3 | 1.1 | 1.8 |
| 2000p-pg0 | 6x | 3.84 | 3 | middle | 132 | 8.4 | 10 | 12.3 | 21.8 | 8.3, 8.6, 7.9 | 0.9 | 1.9 |
| 2000p-pg0 | 6x | 3.84 | 3 | end | 132 | 5.6 | 6.9 | 7.3 | 8.1 | 5.7, 5.7, 5.5 | 0.8 | 1.5 |
| 1000p-nocv-pg1 | 1x | 2.62 | 3 | start | 132 | 15.2 | 18.9 | 19.4 | 19.5 | 15.3, 14, 16.4 | 0.3 | 0.6 |
| 1000p-nocv-pg1 | 1x | 2.62 | 3 | middle | 132 | 15.9 | 20.6 | 24.7 | 24.9 | 16.4, 15.9, 15.7 | 0.3 | 0.5 |
| 1000p-nocv-pg1 | 1x | 2.62 | 3 | end | 132 | 19.5 | 22.2 | 22.5 | 23.4 | 19.5, 19.5, 19 | 0.5 | 0.8 |
| 1000p-nocv-pg1 | 4x | 2.62 | 3 | start | 132 | 32.5 | 33.7 | 34.7 | 36.1 | 32.5, 32.7, 32.4 | 0.8 | 1.2 |
| 1000p-nocv-pg1 | 4x | 2.62 | 3 | middle | 132 | 36.1 | 39.6 | 53.3 | 53.7 | 36, 35.7, 37.4 | 0.8 | 1.6 |
| 1000p-nocv-pg1 | 4x | 2.62 | 3 | end | 132 | 51.4 | 54.3 | 56.6 | 58.1 | 51.9, 51.4, 49.9 | 1.5 | 2.2 |
| 1000p-nocv-pg1 | 6x | 2.62 | 3 | start | 132 | 47.8 | 51.3 | 53.1 | 54.1 | 49.1, 45.8, 46.8 | 1.2 | 2.1 |
| 1000p-nocv-pg1 | 6x | 2.62 | 3 | middle | 132 | 49.8 | 57.4 | 77.7 | 81.3 | 55, 49.4, 45 | 1.2 | 2 |
| 1000p-nocv-pg1 | 6x | 2.62 | 3 | end | 132 | 68.8 | 79.4 | 82.4 | 83.5 | 74.7, 69, 65.4 | 1.8 | 3.3 |
| 2000p-nocv-pg1 | 1x | 2.62 | 3 | start | 132 | 18.4 | 22.5 | 23.9 | 24.8 | 15.1, 20.7, 20.7 | 0.3 | 0.6 |
| 2000p-nocv-pg1 | 1x | 2.62 | 3 | middle | 132 | 21.8 | 24.4 | 32.8 | 33.5 | 17, 23.2, 22.8 | 0.3 | 0.4 |
| 2000p-nocv-pg1 | 1x | 2.62 | 3 | end | 132 | 22.8 | 25.3 | 26.2 | 26.6 | 20.1, 23.8, 24.1 | 0.2 | 0.5 |
| 2000p-nocv-pg1 | 4x | 2.62 | 3 | start | 132 | 59 | 61.7 | 63.7 | 63.7 | 60.4, 57.8, 58.2 | 1 | 1.7 |
| 2000p-nocv-pg1 | 4x | 2.62 | 3 | middle | 132 | 65 | 72.2 | 94.7 | 104 | 67.9, 64.2, 64.5 | 0.9 | 1.6 |
| 2000p-nocv-pg1 | 4x | 2.62 | 3 | end | 132 | 70.4 | 75.6 | 78.3 | 82.1 | 71.8, 70, 69.4 | 0.8 | 1.3 |
| 2000p-nocv-pg1 | 6x | 2.62 | 3 | start | 132 | 88.3 | 95.3 | 102.3 | 102.4 | 91.7, 86.2, 86.3 | 1.5 | 3.2 |
| 2000p-nocv-pg1 | 6x | 2.62 | 3 | middle | 132 | 98.2 | 107.8 | 144.1 | 262.4 | 103.1, 97.1, 96.3 | 1.4 | 2.3 |
| 2000p-nocv-pg1 | 6x | 2.62 | 3 | end | 132 | 106.4 | 116.2 | 120.6 | 124.5 | 112.5, 104.4, 104.3 | 1.2 | 2.2 |
| 1000p-flat | 1x | 2.62 | 3 | start | 132 | 16.5 | 23.6 | 25 | 26.2 | 19.8, 17.6, 13.1 | 1.6 | 2.5 |
| 1000p-flat | 1x | 2.62 | 3 | middle | 132 | 17.7 | 24.2 | 25.1 | 26 | 20.6, 19.2, 14.3 | 1.3 | 1.8 |
| 1000p-flat | 1x | 2.62 | 3 | end | 132 | 17.8 | 23.3 | 25.3 | 27.5 | 20.8, 15, 17 | 0.6 | 0.8 |
| 1000p-flat | 4x | 2.62 | 3 | start | 132 | 46 | 63.1 | 66.7 | 66.8 | 45.6, 45.2, 54.1 | 4.8 | 5.9 |
| 1000p-flat | 4x | 2.62 | 3 | middle | 132 | 53.9 | 69.1 | 72.1 | 74.6 | 53.5, 49.3, 62.7 | 4.2 | 5.1 |
| 1000p-flat | 4x | 2.62 | 3 | end | 132 | 51.8 | 62.4 | 66.3 | 75.3 | 52, 49.1, 55.8 | 1.8 | 2.5 |
| 1000p-flat | 6x | 2.62 | 3 | start | 132 | 70.3 | 92.7 | 97.7 | 107.8 | 85.7, 68.3, 69 | 7.6 | 9.1 |
| 1000p-flat | 6x | 2.62 | 3 | middle | 132 | 75.8 | 92.4 | 102.7 | 109 | 85.4, 74.1, 75.7 | 5.8 | 6.9 |
| 1000p-flat | 6x | 2.62 | 3 | end | 132 | 75.7 | 88.4 | 99.4 | 99.5 | 77.2, 74.5, 76.4 | 2.6 | 3.9 |
| 2000p-flat | 1x | 2.62 | 3 | start | 132 | 30.7 | 32.3 | 32.9 | 35.6 | 30.7, 30.8, 30.6 | 2.7 | 3.2 |
| 2000p-flat | 1x | 2.62 | 3 | middle | 132 | 32.7 | 36.2 | 40.1 | 42.6 | 32.5, 32.3, 33.3 | 2.2 | 2.4 |
| 2000p-flat | 1x | 2.62 | 3 | end | 132 | 33.2 | 36.8 | 40.1 | 40.2 | 33, 33, 33.3 | 1 | 1.1 |
| 2000p-flat | 4x | 2.62 | 3 | start | 132 | 102.8 | 112.4 | 126.1 | 143.6 | 104.1, 101.5, 101.7 | 8.9 | 10.4 |
| 2000p-flat | 4x | 2.62 | 3 | middle | 132 | 109.6 | 126.2 | 139.5 | 156.1 | 111.6, 109.6, 108.1 | 7.7 | 9 |
| 2000p-flat | 4x | 2.62 | 3 | end | 132 | 110.4 | 118.6 | 149.4 | 150.4 | 112.1, 109.7, 110.1 | 3.4 | 4 |
| 2000p-flat | 6x | 2.62 | 1 | start | 44 | 190 | 739.9 | 749.5 | 749.5 | 190 | 15.3 | 17.4 |
| 2000p-flat | 6x | 2.62 | 1 | middle | 44 | 207.6 | 592.8 | 610.3 | 610.3 | 207.6 | 12.4 | 13.6 |
| 2000p-flat | 6x | 2.62 | 1 | end | 44 | 204.7 | 425.7 | 603.6 | 603.6 | 204.7 | 5.3 | 7.4 |
| 2000p-wrap25-pg1 | 1x | 2.62 | 2 | middle | 88 | 6.2 | 7.6 | 8.7 | 8.7 | 6.2, 6.2 | 1.8 | 2.5 |
| 2000p-wrap25-pg1 | 6x | 2.62 | 2 | middle | 88 | 9.6 | 12.6 | 15.1 | 15.1 | 9.8, 9.5 | 3.4 | 5.5 |
| 2000p-wrap50-pg1 | 1x | 2.62 | 2 | middle | 88 | 4 | 4.9 | 5.7 | 5.7 | 3.9, 4 | 1 | 1.3 |
| 2000p-wrap50-pg1 | 6x | 2.62 | 2 | middle | 88 | 6.2 | 9.1 | 10.6 | 10.6 | 6.5, 5.9 | 1.7 | 2.9 |
| 2000p-wrap100-pg1 | 1x | 2.62 | 2 | middle | 88 | 3.8 | 4.9 | 5.4 | 5.4 | 4, 3.7 | 0.8 | 1.2 |
| 2000p-wrap100-pg1 | 6x | 2.62 | 2 | middle | 88 | 5.3 | 7.8 | 8.9 | 8.9 | 5.3, 5.3 | 1.3 | 2.1 |
| 2000p-wrap250-pg1 | 1x | 2.62 | 2 | middle | 88 | 4 | 4.6 | 5.2 | 5.2 | 3.9, 4 | 0.8 | 1.1 |
| 2000p-wrap250-pg1 | 6x | 2.62 | 2 | middle | 88 | 6.3 | 10.7 | 22.3 | 22.3 | 6.2, 6.4 | 1.3 | 2.5 |
| 2000p-wrap500-pg1 | 1x | 2.62 | 2 | middle | 88 | 4.8 | 5.5 | 7.4 | 7.4 | 4.8, 4.7 | 1 | 1.3 |
| 2000p-wrap500-pg1 | 6x | 2.62 | 2 | middle | 88 | 8.3 | 10.7 | 13.2 | 13.2 | 8.1, 8.5 | 1.6 | 2.6 |
| 2000p-wrap100-over4-pg1 | 1x | 2.62 | 2 | middle | 88 | 4.3 | 5 | 11.5 | 11.5 | 4.2, 4.4 | 1 | 1.4 |
| 2000p-wrap100-over4-pg1 | 6x | 2.62 | 2 | middle | 88 | 6.9 | 12.5 | 330 | 330 | 7, 6.9 | 1.8 | 3.4 |
| 120p-zoom150-pg1 | 6x | 3.89 | 3 | start | 132 | 2.7 | 4.4 | 5.1 | 6 | 3, 2.7, 2.4 | 0.2 | 1.7 |
| 120p-zoom150-pg1 | 6x | 3.89 | 3 | middle | 132 | 3.1 | 6.6 | 12.7 | 16.9 | 3.8, 3.2, 3 | 0.2 | 1.9 |
| 120p-zoom150-pg1 | 6x | 3.89 | 3 | end | 132 | 2.3 | 3.7 | 4 | 5 | 2.3, 2, 2.5 | 0.2 | 1.5 |

## Typing budget by size

Each paginated row against the typing budget (p50 / p95 / p99 ≤ 16 / 33 / 50 ms at the worst position; variation across positions ≤ 20 %), computed as the gate computes it. Each interval is a 95 % percentile bootstrap interval (10,000 resamples, seed 1): loads are drawn first and keystrokes within each drawn load second, and the positions (and configurations) measured in one load are drawn together. A statistic is `within` only when its whole interval is at or under the budget, `over` only when the whole interval is above it, and otherwise `inconclusive`; `hard fail` marks a whole interval above the hard-fail figure.

| Row | Throttle | Load baseline | p50 (interval) | p95 (interval) | p99 (interval) | Variation (interval) | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 120p-pg1 | 1x | 3.84 | 1.5 (1 – 2.5) within | 3.2 (1.1 – 3.5) within | 3.5 (1.3 – 5) within | 87.5 % (11.1 % – 175 %) inconclusive | inconclusive |
| 120p-pg1 | 4x | 3.84 | 3.9 (3.5 – 4.2) within | 4.7 (4.5 – 5.2) within | 5.4 (4.8 – 14.5) within | 21.9 % (16.1 % – 30 %) inconclusive | inconclusive |
| 120p-pg1 | 6x | 3.84 | 5.3 (5.2 – 5.6) within | 6.9 (6.6 – 7.6) within | 7.6 (6.8 – 9.4) within | 23.3 % (17.8 % – 34.1 %) inconclusive | inconclusive |
| 1000p-pg1 | 1x | 3.84 | 2.9 (2.7 – 3.1) within | 3.9 (3.7 – 4.3) within | 4.3 (4.1 – 7.9) within | 52.6 % (6.9 % – 150 %) inconclusive | inconclusive |
| 1000p-pg1 | 4x | 3.84 | 4.8 (4.5 – 5.1) within | 6.3 (5.8 – 7) within | 7 (6.6 – 7.1) within | 23.1 % (14.6 % – 32.4 %) inconclusive | inconclusive |
| 1000p-pg1 | 6x | 3.84 | 7.3 (6.5 – 8.1) within | 9.5 (8.2 – 10) within | 10 (9.3 – 12.1) within | 23.7 % (15.8 % – 30.6 %) inconclusive | inconclusive |
| 2000p-pg1 | 1x | 3.84 | 3.4 (3.2 – 4.1) within | 4.8 (4.5 – 5.1) within | 5.3 (5 – 9.8) within | 9.7 % (6.2 % – 200 %) inconclusive | inconclusive |
| 2000p-pg1 | 4x | 3.84 | 6.2 (5.5 – 6.5) within | 7.4 (6.7 – 10.4) within | 10.4 (7.3 – 20.6) within | 29.2 % (21.3 % – 39.1 %) over | fail |
| 2000p-pg1 | 6x | 3.84 | 8.3 (8 – 8.6) within | 9.9 (9.4 – 10.6) within | 12.7 (9.8 – 12.9) within | 27.7 % (17.6 % – 37.1 %) inconclusive | inconclusive |
| 1000p-nocv-pg1 | 1x | 2.62 | 19.5 (18.5 – 19.8) over | 22.2 (21.3 – 22.5) within | 24.7 (22.2 – 24.9) within | 28.3 % (18.9 % – 40 %) inconclusive | fail |
| 1000p-nocv-pg1 | 4x | 2.62 | 51.4 (49.9 – 51.9) over; hard fail | 54.3 (53 – 56.4) over; hard fail | 56.6 (54.3 – 58.1) over | 58.2 % (53.5 % – 59.8 %) over; hard fail | fail |
| 1000p-nocv-pg1 | 6x | 2.62 | 68.8 (65.2 – 74.6) over; hard fail | 79.4 (72.8 – 81.9) over; hard fail | 82.4 (73.2 – 83.5) over | 43.9 % (39.1 % – 53 %) over | fail |
| 2000p-nocv-pg1 | 1x | 2.62 | 22.8 (20.1 – 24.2) over | 25.3 (22.9 – 25.7) within | 32.8 (25.3 – 33.5) within | 23.9 % (14 % – 39.9 %) inconclusive | fail |
| 2000p-nocv-pg1 | 4x | 2.62 | 70.4 (69.3 – 71.8) over; hard fail | 75.6 (72.6 – 93.6) over; hard fail | 94.7 (76.3 – 104) over | 19.3 % (18.1 % – 21.3 %) inconclusive | fail |
| 2000p-nocv-pg1 | 6x | 2.62 | 106.4 (103.9 – 112.5) over; hard fail | 116.2 (108.5 – 142.5) over; hard fail | 144.1 (116.5 – 262.4) over; hard fail | 20.5 % (19.2 % – 23 %) inconclusive | fail |

Comfort limit from the 6x rows with containment (`matrix`): **120 (not even 120 pages is within)** pages.
Comfort limit without containment (`fallback` `nocv` rows at 1,000 and 2,000 pages, `matrix` at 120): **120 (not even 120 pages is within)** pages.

## Engine work per keystroke

From `matrix.jsonl`, the paginated rows; all positions and loads together. Budget for the engine: ≤ 0.5 ms (hard fail > 2 ms).

| Row | Throttle | Load baseline | Engine p50 | Engine p95 | Decorations p50 | Decorations p95 | Engine plus decorations p95 (interval) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 120p-pg1 | 1x | 3.84 | 0 | 0.1 | 0 | 0.1 | 0.2 (0.1 – 0.2) |
| 120p-pg1 | 4x | 3.84 | 0 | 0.7 | 0 | 0.7 | 0.9 (0.7 – 0.9) |
| 120p-pg1 | 6x | 3.84 | 0 | 0.7 | 0 | 1 | 1.2 (0.9 – 1.3) |
| 1000p-pg1 | 1x | 3.84 | 0.1 | 0.2 | 0.1 | 0.2 | 0.3 (0.3 – 0.3) |
| 1000p-pg1 | 4x | 3.84 | 0 | 0.8 | 0 | 0.6 | 0.9 (0.8 – 0.9) |
| 1000p-pg1 | 6x | 3.84 | 0 | 1.1 | 0.1 | 1.1 | 1.3 (1.2 – 1.3) |
| 2000p-pg1 | 1x | 3.84 | 0.1 | 0.5 | 0.1 | 0.2 | 0.6 (0.5 – 0.7) |
| 2000p-pg1 | 4x | 3.84 | 0.1 | 0.9 | 0.1 | 0.7 | 1 (0.9 – 1.4) |
| 2000p-pg1 | 6x | 3.84 | 0.1 | 1.3 | 0.1 | 1.2 | 1.6 (1.4 – 1.8) |

## Full cold repagination

From `cold.jsonl`: `__pg.cold()` 20 times per load, a fresh copy of the blocks each time.

| Row | Throttle | Load baseline | Loads | p50 | p95 | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| 120p-cold | 1x | 1.53 | 3 | 1.4 | 2.5 | ≤ 10 ms (hard fail > 30 ms) |
| 120p-cold | 6x | 1.53 | 3 | 8.8 | 12 | ≤ 10 ms (hard fail > 30 ms) |
| 1000p-cold | 1x | 1.53 | 3 | 11.9 | 18.7 | no threshold |
| 1000p-cold | 6x | 1.53 | 3 | 75.2 | 112.3 | no threshold |
| 2000p-cold | 1x | 1.53 | 3 | 24.1 | 69.7 | ≤ 150 ms (hard fail > 400 ms) |
| 2000p-cold | 6x | 1.53 | 3 | 157.4 | 425.1 | ≤ 150 ms (hard fail > 400 ms) |

## The frame in which many breaks move

From `breaks.jsonl`: the caret in the first block at offset 10, Enter 20 times; the largest keystroke-to-frame value of all presses, and the page starts that moved in that press. Budget: ≤ 50 ms (hard fail > 100 ms).

| Row | Throttle | Load baseline | Loads | Largest keystroke to frame | Page starts moved in that press | p50 of all presses |
| --- | --- | --- | --- | --- | --- | --- |
| 120p-breaks | 1x | 2.56 | 3 | 7.4 | 86 | 2.7 |
| 120p-breaks | 6x | 2.56 | 3 | 18.6 | 0 | 4.6 |
| 1000p-breaks | 1x | 2.56 | 3 | 22.5 | 24 | 3.5 |
| 1000p-breaks | 6x | 2.56 | 3 | 28.6 | 0 | 6.4 |
| 2000p-breaks | 1x | 2.56 | 3 | 16 | 0 | 4.4 |
| 2000p-breaks | 6x | 2.56 | 3 | 41.9 | 0 | 8.6 |

## First editable frame and heap

From `matrix.jsonl`, the paginated rows: per load, smallest / median / largest.

| Row | Throttle | Load baseline | First editable, s | Budget | Heap, MB | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| 120p-pg1 | 1x | 3.84 | 0.04 / 0.04 / 0.04 | ≤ 1.0 s (hard fail > 2.0 s) | 4 / 4 / 4 | ≤ 150 MB (hard fail > 400 MB) |
| 120p-pg1 | 4x | 3.84 | 0.13 / 0.13 / 0.14 | ≤ 1.0 s (hard fail > 2.0 s) | 4 / 4 / 4 | ≤ 150 MB (hard fail > 400 MB) |
| 120p-pg1 | 6x | 3.84 | 0.2 / 0.2 / 0.21 | ≤ 1.0 s (hard fail > 2.0 s) | 4 / 4 / 4 | ≤ 150 MB (hard fail > 400 MB) |
| 1000p-pg1 | 1x | 3.84 | 0.1 / 0.11 / 0.11 | no threshold | 15 / 15 / 15 | no threshold |
| 1000p-pg1 | 4x | 3.84 | 0.4 / 0.4 / 0.42 | no threshold | 15 / 15 / 15 | no threshold |
| 1000p-pg1 | 6x | 3.84 | 0.63 / 0.64 / 0.68 | no threshold | 15 / 15 / 15 | no threshold |
| 2000p-pg1 | 1x | 3.84 | 0.19 / 0.2 / 0.2 | ≤ 6.0 s (hard fail > 12 s) | 28 / 28 / 28 | ≤ 600 MB (hard fail > 1.5 GB) |
| 2000p-pg1 | 4x | 3.84 | 0.77 / 0.8 / 0.82 | ≤ 6.0 s (hard fail > 12 s) | 28 / 28 / 28 | ≤ 600 MB (hard fail > 1.5 GB) |
| 2000p-pg1 | 6x | 3.84 | 1.18 / 1.19 / 1.21 | ≤ 6.0 s (hard fail > 12 s) | 28 / 28 / 28 | ≤ 600 MB (hard fail > 1.5 GB) |

## Scrolling

From `matrix.jsonl`, the paginated rows: a jump-scroll through the whole document in 60 steps per load. Budget: frame p95 ≤ 16.7 ms and frames over 50 ms ≤ 1 % (hard fail > 33 ms and > 5 %).

| Row | Throttle | Load baseline | Frames | Frame p95 | Frames over 50 ms |
| --- | --- | --- | --- | --- | --- |
| 120p-pg1 | 1x | 3.84 | 180 | 18.1 | 0 % |
| 120p-pg1 | 4x | 3.84 | 180 | 17.4 | 0 % |
| 120p-pg1 | 6x | 3.84 | 180 | 18.8 | 0 % |
| 1000p-pg1 | 1x | 3.84 | 180 | 18.2 | 0 % |
| 1000p-pg1 | 4x | 3.84 | 180 | 18.6 | 0 % |
| 1000p-pg1 | 6x | 3.84 | 180 | 17.7 | 0 % |
| 2000p-pg1 | 1x | 3.84 | 180 | 17.6 | 0 % |
| 2000p-pg1 | 4x | 3.84 | 180 | 17.8 | 0 % |
| 2000p-pg1 | 6x | 3.84 | 180 | 18.2 | 0 % |

## Section size

From `sweep.jsonl`: 2,000 pages, the middle of the document, 2 loads (below the sample size that decides). No threshold.

| Row | Throttle | Load baseline | p50 | p95 | Dispatch p95 | Engine plus decorations p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 2000p-wrap25-pg1 | 1x | 2.62 | 6.2 | 7.6 | 2.5 | 0.4 |
| 2000p-wrap25-pg1 | 6x | 2.62 | 9.6 | 12.6 | 5.5 | 1.8 |
| 2000p-wrap50-pg1 | 1x | 2.62 | 4 | 4.9 | 1.3 | 0.4 |
| 2000p-wrap50-pg1 | 6x | 2.62 | 6.2 | 9.1 | 2.9 | 1.5 |
| 2000p-wrap100-pg1 | 1x | 2.62 | 3.8 | 4.9 | 1.2 | 0.4 |
| 2000p-wrap100-pg1 | 6x | 2.62 | 5.3 | 7.8 | 2.1 | 1.3 |
| 2000p-wrap250-pg1 | 1x | 2.62 | 4 | 4.6 | 1.1 | 0.4 |
| 2000p-wrap250-pg1 | 6x | 2.62 | 6.3 | 10.7 | 2.5 | 1.5 |
| 2000p-wrap500-pg1 | 1x | 2.62 | 4.8 | 5.5 | 1.3 | 0.3 |
| 2000p-wrap500-pg1 | 6x | 2.62 | 8.3 | 10.7 | 2.6 | 1.5 |
| 2000p-wrap100-over4-pg1 | 1x | 2.62 | 4.3 | 5 | 1.4 | 0.4 |
| 2000p-wrap100-over4-pg1 | 6x | 2.62 | 6.9 | 12.5 | 3.4 | 1.5 |

Lowest 6x p95: `2000p-wrap100-pg1`.
A section four times its target, 1x: p95 5 against 4.9 (0.1 more).
A section four times its target, 6x: p95 12.5 against 7.8 (4.7 more).

## WebKit and Firefox

From `xbrowser-webkit.jsonl` and `xbrowser-firefox.jsonl`: 2,000 pages, the middle of the document, no CPU throttle (these engines have none). Engines that tick animation frames on a fixed clock add the wait for the next tick to keystroke to frame, so the dispatch share is shown beside it.

| Engine | Version | Row | Load baseline | Loads | p50 | p95 | p99 | Dispatch p95 | First editable, s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| webkit | 27.2 | 2000p-flat | 1.29 | 3 | 26 | 29 | 33 | 3 | 0.47 / 0.48 / 0.53 |
| webkit | 27.2 | 2000p-pg1 | 1.29 | 3 | 10 | 18 | 19 | 2 | 0.34 / 0.35 / 0.35 |
| firefox | 159.0 | 2000p-flat | 1.09 | 3 | 21 | 23 | 29 | 9 | 0.34 / 0.35 / 0.39 |
| firefox | 159.0 | 2000p-pg1 | 1.09 | 3 | 14 | 17 | 21 | 3 | 0.28 / 0.28 / 0.28 |
