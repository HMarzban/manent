# 0011. One document must stay comfortable at 2,000 pages

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

A feature film runs to about 120 pages, but some works are far longer, such as a novel-length manuscript. The project owner set a target well past ordinary scripts: one document stays comfortable at 2,000 pages, which is roughly 2.4 million characters.

The evidence so far comes from a throwaway browser prototype: bare ProseMirror with no sync and no pagination attached, headless Chromium on one Apple-silicon laptop, synthetic script-shaped text, three runs. A flat 2,000-page document cost about 38 ms from keystroke to the next frame, and about 149 ms with the CPU throttled four times. With blocks grouped into invisible sections of about 100 blocks, the same keystroke cost about 3 ms and 7 ms. The cost followed the number of blocks far more than the number of characters.

## Options considered

- About 300 pages, with longer works split into parts. Not chosen: the owner wanted one document to hold the longest works.
- 2,000 pages. Chosen.

## Decision

Typing, opening and scrolling must stay within their budgets for a single 2,000-page document. That rules out a flat document of 50,000 blocks under one editable element.

## Consequences and trade-offs

- The invisible sections of decision 0015 follow from this target, and short scripts carry them too, although a script of 120 pages would be fine without them.
- Past the comfort limit measured for a device, the app is to say so once and offer to split the script. It never refuses a long document.
- Nothing has been measured with the real editor, real fonts, sync or pagination. Until it is, 2,000 pages is a target, not a result.

## Revisit when

The benchmark measures the real editor at 2,000 pages, or real use shows that documents of this length do not occur.
