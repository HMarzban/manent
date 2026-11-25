// Styles for Ink problem underlines, problem and visited gutter marks, tooltip, and polite live region.
export const INK_MARKS_CSS = `
.mn-ink-problem {
  text-decoration: underline wavy var(--ink-problem);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}
.mn-ink-gutter {
  position: absolute;
  top: 0;
  right: calc(100% + 4.3ch);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 1.5em;
  user-select: none;
  pointer-events: auto;
}
.mn-ink-mark {
  display: inline-block;
  flex-shrink: 0;
  cursor: pointer;
}
.mn-ink-mark-problem {
  width: 7px;
  height: 7px;
  background-color: var(--ink-problem);
  transform: rotate(45deg);
  border-radius: 1px;
}
.mn-ink-mark-visited {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--fg-muted);
}
.mn-ink-tooltip {
  position: absolute;
  z-index: var(--z-overlay);
  max-width: 24rem;
  padding: 0.25rem 0.5rem;
  background-color: var(--bg-overlay);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: var(--shape-surface);
  box-shadow: var(--elev-overlay);
  font: 400 var(--type-meta) / var(--lh-meta) var(--face-ui);
  pointer-events: none;
  white-space: pre-wrap;
}
.mn-ink-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
