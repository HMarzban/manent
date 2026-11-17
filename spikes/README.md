# Spikes

Three throwaway experiments that answer feasibility questions for Manent before the product commits to a choice. They are not product code, and the product never imports from them. Each folder holds its own tooling, raw results and a `RESULT.md` with the answer, the numbers behind it and the decision.

| Folder | Question |
|---|---|
| `01-electrobun/` | Does Electrobun work as the desktop shell on macOS, Windows and Linux? Does any fallback trigger fire: an operating system with no runnable installer, a cold start more than 1.5 times Electron's, `contenteditable` or input-method defects that Electron does not show, or an updater that fails on Windows? |
| `02-offline-shell/` | Can a service worker serve the app shell offline, answer API calls from the network only, and pick up a new shell after an update? |
| `03-pagination-containment/` | Can screenplay pages be laid out by measuring lines in the browser, and can the layout work be contained so that typing stays responsive? |

Read each folder's `RESULT.md` for the outcome.

## Tooling

| Item | Value |
|---|---|
| Bun | 1.4.4 |
| Playwright | 1.65.1; Chromium 159.0.8154.6, Firefox 159.0, WebKit 27.2 (`browser.version()`) |
| Playwright image | `mcr.microsoft.com/playwright:v1.65.1-noble`, `mcr.microsoft.com/playwright@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579` |
| Bun image | `oven/bun:1.4.4`, `oven/bun@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d` |
| actionlint image | `rhysd/actionlint:latest`, `rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667` |
| Date | 2026-11-17 |
