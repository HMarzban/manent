// Syncs `.mn-sheet` underlay positions and heights to rendered `.pb` breaks while inline diff marks (`display: "page"`) are shown.
import { Plugin } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { changesKey } from "../changes/plugin.ts";
import { screenPagePx, unitPxOf } from "../page/profile-css.ts";
import type { PageBox, PageScaffold } from "../page/scaffold.ts";
import { driftKey } from "./drift.ts";
import { paginationKey } from "./plugin.ts";

const GRID_STEPS = 4;

function snap(px: number): number {
  return Math.round(px * GRID_STEPS) / GRID_STEPS;
}

function isDiffOnPage(state: EditorState): boolean {
  const changes = changesKey.getState(state);
  return (
    changes !== undefined &&
    changes.comparison !== null &&
    changes.display === "page"
  );
}

function stateChanged(prev: EditorState, next: EditorState): boolean {
  return (
    changesKey.getState(prev) !== changesKey.getState(next) ||
    paginationKey.getState(prev)?.pagination !==
      paginationKey.getState(next)?.pagination ||
    paginationKey.getState(prev)?.decorations !==
      paginationKey.getState(next)?.decorations ||
    driftKey.getState(prev)?.decorations !==
      driftKey.getState(next)?.decorations
  );
}

interface TrimWrite {
  readonly el: HTMLElement;
  readonly trim: number;
  readonly prevTrim: number;
}

/**
 * Keeps page sheets aligned with rendered `.pb` breaks whenever `changesPlugin` renders inline deletions or removed
 * blocks on the page: extra diff height is first absorbed into each page's `.pb-fill` whitespace and any remaining
 * overflow expands only that page's sheet height, keeping every subsequent page and its header aligned at 0 px drift.
 * Zero work is done when `changes` is hidden or in `asterisks` mode.
 */
export function sheetBoxSyncPlugin(scaffold: PageScaffold): Plugin {
  return new Plugin({
    view(editorView) {
      let synced = false;
      const trimmed = new Set<HTMLElement>();

      const clearTrims = (): void => {
        for (const el of trimmed) el.style.removeProperty("--fill-trim");
        trimmed.clear();
      };

      const clear = (): void => {
        clearTrims();
        if (!synced) return;
        synced = false;
        scaffold.setPageBoxes(null);
      };

      const sync = (view: EditorView): void => {
        if (view.isDestroyed) return;
        if (!isDiffOnPage(view.state)) {
          clear();
          return;
        }
        const paged = paginationKey.getState(view.state);
        if (paged === undefined) return;
        const pageCount = paged.pagination.pages.length;
        const scale = Number(scaffold.pages.dataset["zoom"] ?? "1");
        if (!Number.isFinite(scale) || scale <= 0) return;
        const pagesRect = scaffold.pages.getBoundingClientRect();
        if (pagesRect.height <= 0) return;
        const breaks = [
          ...view.dom.querySelectorAll<HTMLElement>(
            ".pb:not(.pb-col):not(.pb-rule)",
          ),
        ];
        if (breaks.length !== pageCount + 1) return;

        const pageHeight = screenPagePx(paged.pagination.profile).height;
        const unitPx = unitPxOf(paged.pagination.profile);
        const boxes: PageBox[] = [];
        const writes: TrimWrite[] = [];
        let cumulativeDeltaTrim = 0;

        for (let i = 0; i < pageCount; i++) {
          const head = breaks[i]!.querySelector<HTMLElement>(".pb-head");
          const endBreak = breaks[i + 1]!;
          const foot = endBreak.querySelector<HTMLElement>(".pb-foot");
          if (head === null || foot === null) return;
          const rawTop =
            (head.getBoundingClientRect().top - pagesRect.top) / scale;
          const rawBottom =
            (foot.getBoundingClientRect().bottom - pagesRect.top) / scale;
          if (rawBottom <= rawTop) return;

          const prevTrim =
            Number.parseFloat(endBreak.style.getPropertyValue("--fill-trim")) ||
            0;
          const fillUnits =
            Number.parseFloat(endBreak.style.getPropertyValue("--fill")) || 0;
          const availFill = Math.max(0, fillUnits) * unitPx;
          const untrimmedHeight = rawBottom - rawTop + prevTrim;
          const extra = Math.max(0, untrimmedHeight - pageHeight);
          const trim = snap(Math.min(extra, availFill));
          const top = snap(rawTop - cumulativeDeltaTrim);
          const height = snap(untrimmedHeight - trim);
          cumulativeDeltaTrim += trim - prevTrim;

          boxes.push({ top, height });
          if (trim !== prevTrim) writes.push({ el: endBreak, trim, prevTrim });
        }

        if (writes.length > 0) {
          const colBreaks =
            view.dom.querySelectorAll<HTMLElement>(".pb.pb-col");
          const colByLabel =
            colBreaks.length === 0
              ? null
              : new Map(
                  [...colBreaks].map((el) => [el.dataset["label"] ?? "", el]),
                );
          for (const { el, trim } of writes) {
            const partner = colByLabel?.get(el.dataset["label"] ?? "") ?? null;
            if (trim > 0) {
              const value = `${trim}px`;
              el.style.setProperty("--fill-trim", value);
              trimmed.add(el);
              if (partner !== null) {
                partner.style.setProperty("--fill-trim", value);
                trimmed.add(partner);
              }
            } else {
              el.style.removeProperty("--fill-trim");
              trimmed.delete(el);
              if (partner !== null) {
                partner.style.removeProperty("--fill-trim");
                trimmed.delete(partner);
              }
            }
          }
        }

        synced = true;
        scaffold.setPageBoxes(boxes);
      };

      const fontObserver =
        typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(() => {
              if (isDiffOnPage(editorView.state)) sync(editorView);
            });
      fontObserver?.observe(scaffold.pages, {
        attributeFilter: ["data-fonts"],
      });

      const resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              if (isDiffOnPage(editorView.state)) sync(editorView);
            });
      resizeObserver?.observe(editorView.dom);

      sync(editorView);
      return {
        update(nextView, prev) {
          if (stateChanged(prev, nextView.state)) sync(nextView);
        },
        destroy() {
          fontObserver?.disconnect();
          resizeObserver?.disconnect();
          clear();
        },
      };
    },
  });
}
