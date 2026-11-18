# Spike 3: arithmetic pagination, sections and `content-visibility` up to 2,000 pages

## Question

Do the arithmetic pagination engine, a decoration plugin that draws its page breaks, and 100-block sections with `content-visibility: auto` stay correct and inside budget at 120, 1,000 and 2,000 pages?

It passes when all four of these hold:

- Pagination's main-thread cost is ≤ 4 ms p95.
- Typing meets the typing budget at 120 pages under 6x CPU throttle.
- Caret, selection and find behave correctly with `content-visibility` on.
- The line wrapper matches Chromium on the corpus.

The 1,000- and 2,000-page results set the published comfort limit. A `content-visibility` failure on an engine switches that engine to the section wrapper without the containment CSS.

Every statistic compared with a threshold carries a 95 % percentile bootstrap interval (10,000 resamples, seed 1). Whole loads are drawn first, then the keystrokes inside each drawn load. A statistic is `within` only when its whole interval is at or under the threshold, `over` only when the whole interval is above it, and otherwise `inconclusive`.

## What was run

All on 2026-11-18, from this folder, each harness at the commit that added its result files on branch `spikes`:

| Commit | What it added |
| --- | --- |
| `6c2a478` | engine, corpus, conformance |
| `74a6194` | editor page |
| `ef22802` | editing and Yjs binding |
| `60a2a3d`, `df772fa` | behaviour checks and the editing fix |
| `ab7b0f9` | typing and pagination timing |
| `58c880b` | remote typing |
| the commit that adds this file | Linux, spellcheck |

Every timed command ran through `scripts/timed.sh`. It starts a run only when the Mac's 1-minute load average is at or below 4.0, and writes that figure into every row as the load baseline.

- `bun test src/engine.test.ts`, `bun harness/smoke.ts`, `bun harness/smoke-edit.ts`.
- `bun harness/conformance.ts all`; `bun harness/risk.ts chromium|webkit|firefox`; `bun harness/risk.ts chromium --zoom 50` and `--zoom 300`; `bun harness/ime.ts`; `bun harness/risk.ts --summarise`.
- Timed: `bun harness/bench.ts gate|matrix|fallback|sweep|zoom|breaks|cold`, `bun harness/xbrowser.ts webkit|firefox`, `bun harness/remote.ts`. Then `bun harness/bench.ts --summarise gate` and `--summarise timing`, and `bun harness/remote.ts --summarise`.
- Linux, in a container built with `docker build -t manent-spike-03 -f docker/Dockerfile .`:
  - Untimed: `docker run --rm --init --ipc=host --cpuset-cpus=0-1 --memory=4g --memory-swap=4g -v "$PWD/results/linux:/spike/results/linux" manent-spike-03 bun harness/linux.ts --untimed`.
  - Timed: `scripts/timed.sh docker run --rm --init --ipc=host --cpuset-cpus=0-1 --memory=4g --memory-swap=4g -e MANENT_TIMED -e MANENT_LOAD_BASELINE -v "$PWD/results/linux:/spike/results/linux" manent-spike-03 bun harness/linux.ts --timed`.
  - Summaries: `bun harness/bench.ts --summarise gate --dir results/linux` and `bun harness/risk.ts --summarise --dir results/linux`.
  - The container is capped at **2 cores and 4 GB** by exactly these flags: `--cpuset-cpus=0-1 --memory=4g --memory-swap=4g`.
- Timed, headed Google Chrome: `caffeinate -dimsu scripts/timed.sh bun harness/spell.ts`.

## Machine and versions

- Apple M5 Max, 18 cores, 48 GB; macOS 27.0.1 (26A434); `bun --version` 1.4.4.
- Playwright 1.65.1, with `browser.version()`: Chromium 159.0.8154.6, Firefox 159.0, WebKit 27.2. The same three in the container.
- Google Chrome 157.0.8103.80 (spellcheck only).
- Docker 29.10.0 through OrbStack, Linux on arm64, native (no emulation).
- Container base `mcr.microsoft.com/playwright:v1.65.1-noble` (`sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579`), with Bun copied from `oven/bun:1.4.4` (`sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d`).
- Packages, from `bun.lock`: `prosemirror-model` 1.25.13, `prosemirror-state` 1.4.4, `prosemirror-view` 1.42.9, `prosemirror-transform` 1.12.5, `prosemirror-keymap` 1.2.3, `prosemirror-commands` 1.7.2, `prosemirror-history` 1.5.1, `yjs` 13.6.33, `y-prosemirror` 1.3.7, `y-protocols` 1.0.7, `@fontsource/courier-prime` 5.3.0, `playwright` 1.65.1.
- Substituted: no package. Docker was 29.10.0, not the 29.9.3 this run was prepared on.

## Numbers

Times are in ms. "6x" is Chromium's CPU throttle.

**Load baselines.** The baseline is the Mac's 1-minute load average when each timed command started:

- 3.68 `gate`, 3.84 `matrix`, 2.62 `fallback` and `sweep`, 3.89 `zoom`, 2.56 `breaks`, 1.53 `cold`;
- 1.29 and 1.09 for WebKit and Firefox;
- 2.46 `remote`, 3.31 spellcheck, 3.65 for the container.

The rows' own `loadStart` and `loadEnd` are recorded for the reader and not acted on. In the container they are the Linux VM's load.

During the container's timed run, from about 17:09, another test process unrelated to this spike was running on the Mac. The Linux timing rows are therefore indicative, and they never stand alone.

**The corpus** (`src/corpus.ts`, generated with a fixed seed). It has sentence ends every 4 to 9 words, and one action or dialogue block in ten is long. That makes page breaks inside blocks frequent.

| Pages | Blocks | Characters | Pages that start inside a block |
| --- | --- | --- | --- |
| 120 | 2,033 | 161,343 | 14 (11.7 %) |
| 1,000 | 16,710 | 1,374,715 | 105 (10.5 %) |
| 2,000 | 33,603 | 2,760,659 | 202 (10.1 %) |

**Pagination cost and typing at 120 pages, 6x.** Sources: `results/gate-summary.md` (`results/gate.jsonl`) and `results/linux/gate-summary.md` (`results/linux/gate.jsonl`). There were 5 fresh loads per configuration, pagination on and off loaded in turn. At each of the start, middle and end, the 44-keystroke sentence was typed five times, giving 1,100 keystrokes per position.

| Statistic | This Mac (baseline 3.68) | Container, 2 cores and 4 GB (baseline 3.65) | Threshold |
| --- | --- | --- | --- |
| Added dispatch p95 with pagination, worst position | 0.4 (0.3 – 0.6) within | 0.6 (0.4 – 1.3) within | ≤ 4 (hard fail > 8) |
| Engine plus decorations per keystroke, p95 (reported) | 1.3 (1.3 – 1.4) | 1.7 (1.2 – 1.8) | — |
| Dispatch p95 with pagination, worst position (reported) | 2.0 (1.9 – 2.2) | 2.5 (2.4 – 3.1) | — |
| Added keystroke-to-frame p95, worst position (reported) | 0.4 (0.0 – 0.6) | 0.8 (0.2 – 2.2) | — |
| Keystroke to frame p50, worst position | 5.8 (5.2 – 6.2) within | 8.2 (6.9 – 9.1) within | ≤ 16 (hard fail > 33) |
| Keystroke to frame p95, worst position | 7.4 (6.9 – 7.5) within | 12.8 (11.7 – 13.9) within | ≤ 33 (hard fail > 50) |
| Keystroke to frame p99, worst position | 9.0 (7.9 – 11.5) within | 17.4 (15.7 – 22.3) within | ≤ 50 (hard fail > 100) |
| Variation of p50 across start, middle and end | 23.4 % (12.0 – 27.7 %) inconclusive | 18.8 % (9.4 – 28.2 %) inconclusive | ≤ 20 % (hard fail > 50 %) |

**Typing at 1,000 and 2,000 pages, 6x, against the typing budget.** Source: `results/timing-summary.md` (`matrix.jsonl`, `fallback.jsonl`); 3 loads × 44 keystrokes per position.

| Row | Baseline | p50 | p95 | p99 | Variation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 120 pages, sections with containment | 3.84 | 5.3 (5.2 – 5.6) within | 6.9 (6.6 – 7.6) within | 7.6 (6.8 – 9.4) within | 23.3 % (17.8 – 34.1 %) inconclusive | inconclusive |
| 1,000 pages, sections with containment | 3.84 | 7.3 (6.5 – 8.1) within | 9.5 (8.2 – 10.0) within | 10.0 (9.3 – 12.1) within | 23.7 % (15.8 – 30.6 %) inconclusive | inconclusive |
| 2,000 pages, sections with containment | 3.84 | 8.3 (8.0 – 8.6) within | 9.9 (9.4 – 10.6) within | 12.7 (9.8 – 12.9) within | 27.7 % (17.6 – 37.1 %) inconclusive | inconclusive |
| 1,000 pages, sections without containment | 2.62 | 68.8 (65.2 – 74.6) over | 79.4 (72.8 – 81.9) over | 82.4 (73.2 – 83.5) over | 43.9 % (39.1 – 53.0 %) over | fail |
| 2,000 pages, sections without containment | 2.62 | 106.4 (103.9 – 112.5) over | 116.2 (108.5 – 142.5) over | 144.1 (116.5 – 262.4) over | 20.5 % (19.2 – 23.0 %) inconclusive | fail |

The variation across positions decides the outcome of every containment row. In every one of them, the middle of the document is about 1 ms slower than its end.

**Flat documents** (no sections, no pagination) are in `fallback.jsonl`, middle position, p50 / p95:

| Pages | 1x | 4x | 6x |
| --- | --- | --- | --- |
| 1,000 | 17.7 / 24.2 | 53.9 / 69.1 | 75.8 / 92.4 |
| 2,000 | 32.7 / 36.2 | 109.6 / 126.2 | 207.6 / 592.8 (1 load) |

**Other engines, no throttle, 2,000 pages, middle** (`xbrowser-webkit.jsonl`, `xbrowser-firefox.jsonl`), p50 / p95 / p99. These change nothing.

| Engine | Flat | Sections with containment and pagination |
| --- | --- | --- |
| WebKit 27.2 | 26 / 29 / 33 | 10 / 18 / 19 |
| Firefox 159.0 | 21 / 23 / 29 | 14 / 17 / 21 |

**Section size** (`sweep.jsonl`, 2,000 pages, middle, 2 loads, below the sample size that decides), p95 at 1x / 6x:

| Section size | p95, 1x / 6x |
| --- | --- |
| 25 blocks | 7.6 / 12.6 |
| 50 blocks | 4.9 / 9.1 |
| 100 blocks | 4.9 / 7.8 |
| 250 blocks | 4.6 / 10.7 |
| 500 blocks | 5.5 / 10.7 |

The lowest 6x p95 is at 100 blocks. One section four times its target (`over=4`) costs 5.0 / 12.5, which is 0.1 / 4.7 more than the 100-block row. Its 6x p99 is 330.

**Pasting.** A paste in the middle of a section goes into that section (`smoke-edit.ts` S12 (b): 19 blocks, the section grew from 100 to 119, the section count was unchanged). A paste at a section's end opens new sections of at most 100 blocks (S12 (a)).

**Engine budgets** (`timing-summary.md`). None of these is a criterion of this spike.

- **Engine time per keystroke, p95:** 0.1 / 0.7 / 0.7 at 120 pages and 0.5 / 0.9 / 1.3 at 2,000 pages (1x / 4x / 6x), against ≤ 0.5 (hard fail > 2).
- **Full cold repagination, p95:**

  | Pages | 1x | 6x | Budget |
  | --- | --- | --- | --- |
  | 120 | 2.5 | 12.0 | ≤ 10 (hard fail > 30) |
  | 1,000 | 18.7 | 112.3 | no threshold |
  | 2,000 | 69.7 | 425.1 | ≤ 150 (hard fail > 400) |

- **The frame in which many breaks move** (Enter 20 times in the first block): largest keystroke to frame 7.4 / 18.6 at 120 pages, 22.5 / 28.6 at 1,000 and 16.0 / 41.9 at 2,000 (1x / 6x), against ≤ 50 (hard fail > 100). The largest is the first press each time.
- **First editable frame:** 0.04 / 0.20 s at 120 pages and 0.20 / 1.19 s at 2,000 (1x / 6x), against ≤ 1.0 and ≤ 6.0 s.
- **Heap:** 4 MB at 120 pages and 28 MB at 2,000, against ≤ 150 and ≤ 600 MB.
- **Scroll frame p95:** 17.4 to 18.8 at every size and throttle, with 0 % of frames over 50, against ≤ 16.7 and ≤ 1 % (hard fail > 33 and > 5 %).

**Remote typing through y-prosemirror 1.3.7** (`results/remote-summary.md`, baseline 2.46):

- The extra keystroke-to-frame p95 while a peer types near the top lies between −1.0 and +0.2 in all nine cells (120, 1,000 and 2,000 pages × 1x, 4x, 6x). The largest interval bound is 0.9, against the budget of ≤ 8 (hard fail > 16). Nothing signals that the binding needs replacing.
- A remote update costs a p50 of 0.4 to 1.9 at every size, against about 9 for a flat document at 1,000 pages, 1x.
- One section changes per remote transaction, and 1 to 1.05 section views update per remote update.
- A merged burst of 20 edits costs 53 at 2,000 pages, 6x.

**Spellcheck** (`results/spell.jsonl`, headed Google Chrome, middle, 3 loads × 44, baseline 3.31). The red underline is visible in `results/spell-120.png` and `results/spell-2000.png`, so spellcheck ran. The added cost, p95 with spellcheck minus without:

| Pages | 1x | 6x |
| --- | --- | --- |
| 120 | +6.0 (11.1 against 5.1) | +1.0 (10.4 against 9.4) |
| 2,000 | +0.2 (12.2 against 12.0) | +4.4 (17.8 against 13.4) |

The p50 is unchanged within 0.3. No threshold applies.

**Composition** (`results/ime-chromium.json`). In Chromium's input-method simulation, composing at the end of the line before a mid-block break, at the start of the line after it, and mid-line after it each keeps the text, the widget and pagination intact (I1–I4 pass at all three carets). K3, typing at both ends of a split block, matches flat in every engine on both platforms.

**Zoom.**

- 120 pages at 150 %, 6x (`zoom.jsonl`): p50 / p95 of 2.7 / 4.4 at the start, 3.1 / 6.6 in the middle and 2.3 / 3.7 at the end.
- Conformance at 50, 100, 150 and 300 %: 0 mismatches on the corpus in all three engines on this Mac.
- Behaviour at 50 %: as in a flat document.
- Behaviour at 300 % in Chromium: vertical caret movement differs (B2, K2; see criterion 3).

**Line wrapper conformance** (`conformance-*.json`, `linux/conformance-*.json`). The figure is the number of blocks whose line breaks differ from the engine's. The corpus has 2,033 blocks and the edge matrix 108, at 4 zooms and 4 device scale factors. Every view gave the same count.

| Engine | macOS `pre-wrap` corpus / edge | Linux `pre-wrap` corpus / edge | macOS `break-spaces` corpus | Linux `break-spaces` corpus |
| --- | --- | --- | --- | --- |
| Chromium | 0 / 27 | 595 / 79 | 419 | 809 |
| Firefox | 0 / 62 | 0 / 60 | 419 | 419 |
| WebKit | 0 / 27 | 0 / 42 | 419 | 419 |

On Linux, Chromium draws Courier Prime wider than 9.6 px per cell, so it wraps earlier than the engine. Examples, as the line starts of the engine against the browser:

- action "so on an are will could find down. up water make said it not no will did. it some each make.": 0, 61 against 0, 57;
- action "all go more did out each day they. has up more many what how said. get had your have so her like had. how to the than.": 0, 61 against 0, 57, 113;
- action "with first are part could up my up. his time your two. long her so is.": 0, 60 against 0, 55;
- dialogue "been number one more. about will has when this this said long that. so by him out in with will look up. have were her out.": 0, 33, 68, 104 against 0, 33, 68, 100.

Firefox and WebKit on the same Linux match exactly.

**Behaviour across section boundaries** (`results/risk-summary.md`, `results/linux/risk-summary.md`, 1,000 pages). Three builds were checked: flat, sections with containment (`sec`), and sections with containment and pagination (`secpg`).

- This Mac, 100 %: every group behaves as flat in all three engines.
- Linux, Chromium:
  - K2 across an oversized section, B2, differs. 400 × ArrowDown then 400 × ArrowUp ends at offset −1 against flat's 0, and ArrowDown ends 4 characters short. This occurs only in `secpg`; `sec` matches flat. It reproduced with identical numbers on a second run (not committed).
  - K2 B1 differs by one character at one step, in `sec` and `secpg`. It did not reproduce on the second run.
  - E2, scrolling through the whole document, differs: the height changes during the scroll (it is reported, not part of criterion 3).
- Linux, WebKit: G, a remote edit above the viewport, did not finish in either section build (scroll group, not part of criterion 3).
- This Mac, Chromium at 300 %: B2 and K2 differ in `secpg` only, reproducibly.

## Criteria

| # | Criterion | Measured | Status |
| --- | --- | --- | --- |
| 1 | Pagination adds no more than 4 ms (p95) of main-thread time per keystroke at 120 pages under 6x CPU throttle | This Mac 0.4 ms (0.3 – 0.6); container 0.6 ms (0.4 – 1.3) | pass |
| 2 | Typing at 120 pages under 6x CPU throttle is inside the typing budget: keystroke to next frame p50 / p95 / p99 ≤ 16 / 33 / 50 ms at the worst of start, middle and end, and their p50s vary by ≤ 20 % | This Mac: 5.8 / 7.4 / 9.0 ms within, variation 23.4 % (12.0 – 27.7 %); container: 8.2 / 12.8 / 17.4 ms within, variation 18.8 % (9.4 – 28.2 %) | inconclusive |
| 3 | Caret, selection and find behave as in a flat document with `content-visibility` on: Chromium, macOS | Same as flat at 100 % and 50 %; caret (B2, K2) differs at 300 % | fail |
| 3 | Chromium, Linux | Caret differs: K2 across an oversized section (B2 reproduced, B1 not) | fail |
| 3 | Firefox, macOS / Linux | Same as flat / same as flat | pass / pass |
| 3 | WebKit, macOS / Linux | Same as flat / same as flat | pass / pass |
| 3 | Chromium, Firefox, WebKit on Windows | — | not run (CI) |
| 4 | The line wrapper matches Chromium on the corpus: macOS | 0 of 2,033 blocks in all 8 views | pass |
| 4 | Linux | 595 of 2,033 blocks in all 8 views | fail |
| 4 | Windows | — | not run (CI) |

## Not covered

| Not covered | Stand-in | Limit of the stand-in |
| --- | --- | --- |
| Windows | The `windows-2025` runner, for conformance and behaviour only (`.github/workflows/spike-03-windows.yml`) | "Works or does not"; hosted runners are too noisy for timing |
| Real Safari | Playwright's WebKit build on macOS | Not Safari |
| Release Firefox | Playwright's Firefox build | Not the release build |
| A real slow laptop | Chromium CPU throttle at 4x and 6x; a container capped at 2 cores and 4 GB | Throttle slows the main thread only; a capped core is a fast core in bursts; containers have no graphics card, so paint reads worse |
| Linux on x64 with a GPU | Linux on ARM in the container | Intel emulation is not used |
| Input methods outside Chromium | Chromium's IME simulation over CDP | Firefox and WebKit are on the by-hand list (`BY-HAND.md`) |
| The browser's own find bar | `window.find()` | The real bar is a by-hand check |
| Spellcheck outside Google Chrome | — | A by-hand check in Safari and Firefox |

## Decision

**Fallback on Chromium.** Keep the section wrapper and drop the containment CSS on Chromium, `CONTAINMENT.chromium = false`, because criterion 3 fails there. On Linux at 100 % zoom it fails in K2; on this Mac it fails only at 300 % zoom. In both reproduced differences, only the build with page breaks differs, while the sections with containment alone behave as flat. Dropping the containment CSS is the consequence the rules give for this result.

**Provisional on Firefox and WebKit.** They keep 100-block sections and `content-visibility: auto`, the defaults (`CONTAINMENT.firefox = true`, `CONTAINMENT.webkit = true`). The criteria that are not `pass`, and what closes each:

- **Criterion 2, inconclusive on this Mac and in the container.** No fallback exists for it. p50, p95 and p99 are each well within budget. The statistic that is not within is the variation of p50 across start, middle and end; the middle of the document is about 1 ms slower. Of the 5.8 ms keystroke to frame, the time inside `view.dispatch` is about 2 ms p95 (engine and decorations 1.3 ms p95). The rest is the browser's own style, layout and paint, the stage that cost the time. The product's typesetting benchmark and its benchmark suite measure it again.
- **Criterion 3, fail on Chromium.** This is the fallback above.
- **Criterion 4, fail on Linux.** Chromium on Linux draws the script font wider than its cell; the failing examples are listed under Numbers. The gate is the product's own conformance test for the typesetting code, which fails its build on a Chromium mismatch.
- **Not run:**
  - The Windows run in CI.
  - The three checks of `BY-HAND.md`: the find bar in Chrome, Firefox and Safari; composition beside a mid-block break in Firefox and Safari; the spellcheck underline in Safari and Firefox.

**Comfort limit: 120 pages.** With Chromium's containment off, the rows that decide are the sections without containment at 1,000 and 2,000 pages (both `fail`), and the containment row at 120 pages. That row is not within the budget: its variation across positions is inconclusive. So the value is 120. With containment, the 1,000- and 2,000-page rows would not change this, because their variation is inconclusive too. WebKit and Firefox at 2,000 pages are reported above and change nothing.

## Decision table

| Question | Measured | Threshold | Outcome | Consequence |
| --- | --- | --- | --- | --- |
| Criterion 1, this Mac | 0.4 ms (0.3 – 0.6) | ≤ 4 ms (hard fail > 8 ms) | pass | none |
| Criterion 1, container (2 cores, 4 GB) | 0.6 ms (0.4 – 1.3) | ≤ 4 ms (hard fail > 8 ms) | pass | none |
| Criterion 2, this Mac | p50 / p95 / p99 5.8 / 7.4 / 9.0 ms, within; variation 23.4 % (12.0 – 27.7 %) | ≤ 16 / 33 / 50 ms; variation ≤ 20 % | inconclusive | Provisional; no fallback; the typesetting benchmark and the benchmark suite measure the browser stage again |
| Criterion 2, container (2 cores, 4 GB) | p50 / p95 / p99 8.2 / 12.8 / 17.4 ms, within; variation 18.8 % (9.4 – 28.2 %) | ≤ 16 / 33 / 50 ms; variation ≤ 20 % | inconclusive | as above |
| Criterion 3, Chromium, macOS | same as flat at 100 % and 50 %; caret differs at 300 % | same as flat | fail | `CONTAINMENT.chromium = false` |
| Criterion 3, Chromium, Linux | caret differs (K2 across an oversized section) | same as flat | fail | `CONTAINMENT.chromium = false` |
| Criterion 3, Chromium, Windows | not run (CI) | same as flat | not run | filled by the Windows run |
| Criterion 3, Firefox, macOS | same as flat | same as flat | pass | `CONTAINMENT.firefox = true` |
| Criterion 3, Firefox, Linux | same as flat | same as flat | pass | `CONTAINMENT.firefox = true` |
| Criterion 3, Firefox, Windows | not run (CI) | same as flat | not run | filled by the Windows run; `true` meanwhile |
| Criterion 3, WebKit, macOS | same as flat | same as flat | pass | `CONTAINMENT.webkit = true` |
| Criterion 3, WebKit, Linux | same as flat | same as flat | pass | `CONTAINMENT.webkit = true` |
| Criterion 3, WebKit, Windows | not run (CI) | same as flat | not run | filled by the Windows run; `true` meanwhile |
| Criterion 4, Chromium, macOS | 0 of 2,033 blocks | 0 mismatches | pass | none |
| Criterion 4, Chromium, Linux | 595 of 2,033 blocks | 0 mismatches | fail | Provisional; the typesetting code's own conformance test, which fails its build on a Chromium mismatch, is the gate |
| Criterion 4, Chromium, Windows | not run (CI) | 0 mismatches | not run | filled by the Windows run |
| Comfort limit | 120 pages: the 120-page row is not within (variation inconclusive); the 1,000- and 2,000-page rows without containment fail | the largest size within the typing budget at 6x | 120 (not even 120 is within) | `COMFORT_LIMIT_PAGES = 120` in `apps/web/src/editor-host/comfort.ts` |
| S1 section target size | lowest 6x p95 at 100 blocks (2 loads) | no threshold | reported | `SECTION_TARGET_BLOCKS` stays 100 |
| S2 containment per engine | criterion 3 | — | Chromium `false`, Firefox and WebKit `true` | `CONTAINMENT` in the block below; `packages/editor/src/page/config.ts` takes it |
| S3 `white-space` | `break-spaces` mismatches 419 of 2,033 blocks (809 in Chromium on Linux) against `pre-wrap`'s 0 | no threshold | reported | `WRAP_MODE` stays `"pre-wrap"` |
| S4 width slack | conformance at N + 0.5 cells: 0 corpus mismatches on macOS in every engine | no threshold | reported | `BLOCK_SLACK_CELLS` stays 0.5 |
| S5 break opportunities | edge matrix of 108 blocks: Chromium 27 (Linux 79), Firefox 62 (60), WebKit 27 (42) mismatches | no threshold | reported | `breakAllowed` keeps its table |
| S6 `display: flow-root` | smoke S4: each section's intrinsic size equals its laid-out height, largest difference 0 px | no threshold | reported | stays |
| S7 sections kept beside the selection | used at 1 | no threshold | reported | `KEEP_NEIGHBOURS` stays 1 |
| S8 a break inside a block | I1–I4 pass at three carets (Chromium); K3 same as flat everywhere | no threshold | reported | `MID_BLOCK_BREAKS` stays `"inline"` |
| S9 spellcheck off above a size | added p95 +6.0 / +1.0 ms at 120 pages, +0.2 / +4.4 ms at 2,000 (1x / 6x) | no threshold | reported | `SPELLCHECK_MAX_BLOCKS` stays 7500 |
| S10 zoom | 150 % at 6x p95 ≤ 6.6 ms; conformance 0 at 50–300 %; behaviour same as flat at 50 %, caret differs at 300 % in Chromium | no threshold | reported | `applyZoom` stays |
| S11 engines whose mismatches fail the build | conformance per engine (table above) | no threshold | reported | `BLOCKING_ENGINES` stays Chromium |
| S12 drift monitor | not measured | — | — | stays |
| S13 sheet underlay | not measured | — | — | stays |
| S14 engine budgets | `results/timing-summary.md`: engine p95 0.7 ms at 120 pages, 6x; cold repagination p95 425 ms at 2,000 pages, 6x | the budgets listed there | reported | the typesetting code's budget rows stay |

```ts
CONTAINMENT = { "chromium": false, "firefox": true, "webkit": true }
COMFORT_LIMIT_PAGES = 120
```
