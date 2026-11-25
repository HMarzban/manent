// A change of the frozen layout on a locked script: made by the authority only when the pages it affects
// are the ones the dialog stated, and every affected page marked in the active revision.
import { ORIGIN_SYSTEM, revisedOverrides, scriptSettings } from "@manent/crdt";
import type { Pagination } from "@manent/pagination";
import { layoutImpact, lockedPagination, overrideKey } from "@manent/revisions";
import type { LayoutRequest, ProductionState } from "@manent/sync-protocol";
import { activeSet, isSameList } from "./issue.ts";
import { refused } from "./outcome.ts";
import type { Mutation, ProductionOptions } from "./requests.ts";
import {
  engineVersionOf,
  layoutBlocks,
  layoutUnder,
  notLocked,
  scriptAt,
  stateAnswer,
} from "./state.ts";

/** The ids of the blocks with a line on a page of `labels`, or on an A-page after one. */
function blocksOnPages(p: Pagination, labels: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  let inside = false;
  p.pages.forEach((page, i) => {
    if (page.locked) inside = labels.has(page.label);
    if (!inside) return;
    const next = p.pages[i + 1];
    const end =
      next === undefined
        ? p.blocks.length
        : next.block + (next.line > 0 ? 1 : 0);
    for (const block of p.blocks.slice(page.block, end)) ids.add(block.id);
  });
  return [...ids];
}

export function layoutMutation(
  options: ProductionOptions,
  userId: string,
  request: LayoutRequest,
): Mutation<ProductionState> {
  const { docId, key, changes, affected } = request;
  return {
    docId,
    key,
    need: "issue_revisions",
    tells: ["layout_changed"],
    check(file) {
      const locked = notLocked(file, docId);
      if (locked !== null) return locked;
      const { rules } = options;
      const valid =
        changes.length > 0 &&
        changes.every(
          (c) =>
            c.key !== "script.engineVersion" &&
            rules.isGuarded(c.key) &&
            rules.check(c.key, c.value).ok,
        );
      return valid ? null : refused("bad_request");
    },
    edit(doc, file) {
      const settings = scriptSettings(doc);
      const stored = settings.entries();
      const engineVersion = engineVersionOf(stored);
      const read = scriptAt(doc, file, docId, engineVersion);
      if (!read.ok) return read;
      const { flat, numbers, records, engine, profile } = read.script;
      const changed = Object.fromEntries(changes.map((c) => [c.key, c.value]));
      const after = layoutUnder({ ...stored, ...changed }, engineVersion);
      if (!after.ok) return after;
      const blocks = layoutBlocks(flat, numbers, engine);
      const impact = layoutImpact(
        blocks,
        profile,
        after.profile,
        records,
        engine,
      );
      const same =
        isSameList(impact.gainAPages, affected.gainAPages) &&
        isSameList(impact.fallShort, affected.fallShort);
      if (!same) return { ok: false, reason: "changed" };
      const setAt = options.now();
      for (const { key: setting, value } of changes)
        settings.set(setting, value, {
          userId,
          setAt,
          replaced: stored[setting] ?? null,
        });
      const { pagination } = lockedPagination(
        blocks,
        after.profile,
        records,
        engine,
      );
      const marked = new Set([...impact.gainAPages, ...impact.fallShort]);
      const { id: setId } = activeSet(file, docId);
      const overrides = revisedOverrides(doc);
      for (const blockId of blocksOnPages(pagination, marked))
        overrides.set(overrideKey(setId, blockId), "marked", ORIGIN_SYSTEM);
      return { ok: true };
    },
    commit: () => [],
    ...stateAnswer(options, docId),
  };
}
