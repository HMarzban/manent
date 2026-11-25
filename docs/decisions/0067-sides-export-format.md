# 0067. Sides export whole locked pages with other scenes struck through

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

On a shoot day, cast and crew need sides for a selected range of scenes from a locked shooting script. Repaginating only the chosen scenes would discard the locked page numbers the call sheet, script supervisor and camera reports refer to, while handing out unmarked full pages leaves ambiguity about which scenes on a shared page are actually shooting.

## Options considered

- Repaginate the chosen scenes into a fresh mini-script starting at page 1. Rejected: loses the locked page numbers (`16`, `17`, `18`, A-pages) that the whole production coordinates around.
- Crop or blank out lines belonging to unselected scenes on each locked page. Rejected: blank gaps make page continuity harder to verify on set compared with standard industry practice.
- Export every whole locked page that contains any part of the selected scene range, keeping the locked page labels intact and striking through lines belonging to unselected scenes on those pages. Chosen.

## Decision

Export → Sides (`packages/formats/src/production/sides.ts` and `packages/revisions`) exports whole locked pages covering the selected scene range, preserving each page's locked page label and striking through lines belonging to other scenes on those pages. Editors and coordinators open Sides either from Export → Sides or from a scene's row menu ("Include in sides…") on a locked script.

## Consequences and trade-offs

- Cast and crew receive sides whose page numbers match the locked shooting script and call sheet verbatim, with clear visual exclusion of adjacent scenes on shared pages.
- Sides are available only on locked scripts because unlocked drafts have no locked page labels to preserve.
- Half-page booklet imposition (two-up printing) is not part of this build; standard full-page PDF output prints cleanly on Letter and A4 paper.

## Revisit when

Production teams ask for two-up pocket sides imposition or non-contiguous scene selections beyond a single first-to-last scene range.
