// The undo scope of one editor binding: the one place a Yjs UndoManager is built.
import * as Y from "yjs";
import { ORIGIN_MATERIAL, ORIGIN_REVIEW, yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { FRAGMENT_NAME } from "./mapping.ts";
import {
  ALTERNATES_MAP,
  CUTS_MAP,
  NOTES_MAP,
  SCENE_PROGRESS_MAP,
  TITLE_PAGE_MAP,
} from "./script-maps.ts";

/**
 * The script's fragment, the production map of revised-page overrides, the title page, the notes, the writers'
 * material and the scenes' progress.
 */
export type UndoRoot =
  | "script"
  | "revisedOverrides"
  | "titlePage"
  | "notes"
  | "alternates"
  | "cuts"
  | "sceneProgress";

/** Opaque but for the roots it covers. */
export interface UndoScope {
  readonly roots: readonly UndoRoot[];
}

const ROOT_TYPES: Readonly<
  Record<UndoRoot, (ydoc: Y.Doc) => Y.XmlFragment | Y.Map<unknown>>
> = Object.freeze({
  script: (ydoc) => ydoc.getXmlFragment(FRAGMENT_NAME),
  revisedOverrides: (ydoc) => ydoc.getMap("revisedOverrides"),
  titlePage: (ydoc) => ydoc.getMap(TITLE_PAGE_MAP),
  notes: (ydoc) => ydoc.getMap(NOTES_MAP),
  alternates: (ydoc) => ydoc.getMap(ALTERNATES_MAP),
  cuts: (ydoc) => ydoc.getMap(CUTS_MAP),
  sceneProgress: (ydoc) => ydoc.getMap(SCENE_PROGRESS_MAP),
});

/** The origins whose every transaction is one undo step of its own, never merged with typing. */
const OWN_STEP_ORIGINS: readonly unknown[] = [ORIGIN_REVIEW, ORIGIN_MATERIAL];

/**
 * Undo never deletes a text that still holds characters, so the words someone
 * else typed into a text my step created survive my undo. The same rule as
 * y-prosemirror's own manager, whose protected node the schema does not have.
 */
function keepFilledText(item: Y.Item): boolean {
  return (
    !(item instanceof Y.Item) ||
    !(item.content instanceof Y.ContentType) ||
    !(item.content.type instanceof Y.Text) ||
    item.content.type.length === 0
  );
}

/** A manager that closes its current step before and after every review action and material write, so that neither is ever merged with typing. */
class ReviewStepManager extends Y.UndoManager {
  private readonly closeAtReview = (tr: Y.Transaction): void => {
    if (OWN_STEP_ORIGINS.includes(tr.origin)) this.stopCapturing();
  };

  constructor(
    roots: (Y.XmlFragment | Y.Map<unknown>)[],
    trackedOrigins: readonly unknown[],
  ) {
    super(roots, {
      trackedOrigins: new Set(trackedOrigins),
      captureTransaction: (tr) => tr.meta.get("addToHistory") !== false,
      deleteFilter: keepFilledText,
    });
    // after the manager's own handler, so that the step it has just added is closed
    this.doc.on("beforeTransaction", this.closeAtReview);
    this.doc.on("afterTransaction", this.closeAtReview);
  }

  // Yjs emits nothing when a manager is destroyed, so its listeners come off here
  override destroy(): void {
    this.doc.off("beforeTransaction", this.closeAtReview);
    this.doc.off("afterTransaction", this.closeAtReview);
    super.destroy();
  }
}

class YjsUndoScope implements UndoScope {
  readonly roots: readonly UndoRoot[];
  readonly manager: Y.UndoManager;

  constructor(roots: readonly UndoRoot[], manager: Y.UndoManager) {
    this.roots = roots;
    this.manager = manager;
  }
}

/**
 * A manager over the roots that records only writes whose origin is one of
 * `trackedOrigins`, and never a transaction marked `addToHistory: false`. A
 * transaction of origin ORIGIN_REVIEW or ORIGIN_MATERIAL is always a step of its
 * own.
 */
export function createUndoScope(
  doc: CrdtDoc,
  options: { trackedOrigins: readonly unknown[]; roots: readonly UndoRoot[] },
): UndoScope {
  const ydoc = yDocOf(doc);
  const manager = new ReviewStepManager(
    options.roots.map((root) => ROOT_TYPES[root](ydoc)),
    options.trackedOrigins,
  );
  return new YjsUndoScope([...options.roots], manager);
}

/** The scope's manager, for the editor binding only. Throws a TypeError for a scope createUndoScope did not make. */
export function undoManagerForBinding(scope: UndoScope): Y.UndoManager {
  if (!(scope instanceof YjsUndoScope))
    throw new TypeError("an undo scope must come from createUndoScope");
  return scope.manager;
}

/** True for the transaction of an undo or a redo made by a scope's manager. */
export function isUndoStep(origin: unknown): boolean {
  return origin instanceof ReviewStepManager;
}
