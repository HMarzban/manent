# 0068. Animation pickup lines export dialogue changed since the newest Record draft as CSV

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

After an animation voice-record session, script changes require actors to record pickup lines. Producers and recording engineers need a clean list of only the dialogue lines that changed or were added since the recorded draft, ready to import into studio recording sheets without manually diffing full scripts.

## Options considered

- Offer Pickup lines for every script format and ask the user to pick two arbitrary versions each time. Rejected: adds extra steps for the common animation workflow and clutters Export for live-action formats that do not record pickup sheets.
- Export Pickup lines as PDF only. Rejected: voice-record coordinators filter and sort pickup sheets by actor in spreadsheets and studio tools.
- Offer "Pickup lines (CSV)" on Animation scripts only, diffing dialogue automatically against the newest named draft called `Record` and explaining clearly when no `Record` draft exists yet. Chosen.

## Decision

For Animation scripts only, Export offers `Pickup lines (CSV)` (`packages/revisions/src/numbers/` and `packages/formats/src/reports/`), comparing the current script's dialogue against the newest version named `Record` and writing changed and newly added spoken lines to an RFC 4180 UTF-8 CSV file. When the script has no draft named `Record` yet, Export explains that naming a draft `Record` unlocks pickup lines.

## Consequences and trade-offs

- Animation teams get a zero-configuration pickup sheet directly from the standard `Record` draft on their draft ladder, ready for spreadsheet or booth import.
- Teams that name their recorded draft differently must rename or mark a `Record` draft before exporting pickup lines, and PDF pickup sheets are not generated alongside CSV.

## Revisit when

Animation studios request choosing an arbitrary baseline draft besides `Record`, or voice booths ask for a formatted PDF booth sheet alongside CSV.
