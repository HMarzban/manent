# 0057. Prompter file output uses plain text with a tab-separated row list

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Studios and newsrooms running dedicated prompter hardware often read scripts from a watched folder on a local computer rather than from a browser window. Vendor binary prompter formats and MOS gateways are proprietary and unavailable for testing, so desktop Prompter files output needs an open, deterministic plain-text layout that external software can poll safely.

## Options considered

- Target one vendor's proprietary prompter file format or implement a MOS gateway. Rejected: vendor specifications and hardware systems are not available to build or verify against.
- Write a single combined UTF-8 file for the whole rundown. Rejected: folder-watching prompter tools typically map one file per story plus an ordered index file so re-sending one story rewrites only that story's file and the index.
- Write plain-text files into a chosen folder: `run-order.txt` (tab-separated rows) and one `NN-<slug>.txt` per story, in UTF-8 or Windows-1252, written to a hidden temporary name and renamed atomically. Chosen.

## Decision

Desktop Prompter files output writes `run-order.txt` (one tab-separated line per row—number, slug, file name and formatted duration—including header rows) and one `NN-<slug>.txt` file per story (lowercase hyphenated slug capped at 40 characters with `-2` suffixes on repeats, spoken text from `formatPrompterStory`, Windows CRLF line endings and no byte-order mark). The user picks `UTF-8` or `Windows-1252` (which substitutes `?` for characters it cannot represent and reports how many); only changed story files and `run-order.txt` are rewritten, removed rows have their story files deleted while unrelated files in the folder remain untouched, and every file is written under a hidden temporary name before being renamed into place.

## Consequences and trade-offs

- External prompter tools that watch plain-text folders can consume the output without proprietary drivers, and atomic renames prevent polling readers from seeing partial writes.
- Desktop Prompter files output is currently deferred until the web app finishes (`packages/local-node/src/prompter-files/` holds a stub today); once implemented, it will be verified against Manent's own reader only, not against vendor prompter software.
- Plain-text files carry no vendor-specific formatting codes or hardware cue markers.

## Revisit when

A broadcaster provides documentation and test access for a specific vendor prompter format or MOS gateway.
