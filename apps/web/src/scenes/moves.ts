// Moving a scene of the open script: where a list's move lands it, the message that says so, and the one list of
// scenes a move command reaches.
import { moveScene, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  PLACE_WORDS,
  SCENES_WORDS,
  SCENE_MOVE_WORDS,
  createKeyResolver,
  useCommands,
} from "@manent/ui";
import type { Message, MessageQueue, SortableListHandle } from "@manent/ui";
import {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { liveEditor } from "../editor-host/live-editor.ts";
import { productionServicesFor } from "../production/live-services.ts";
import { useServices } from "../services/context.tsx";
import type { OutlineRow } from "../state/outline.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import type { ProductionPagesSelectors } from "../state/production-pages.store.ts";

// a scene runs up to the next of these, as the scene writer counts it
const SCENE_ENDS: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
  "chapter",
  "act_break",
  "group",
]);

// the pages are laid out again after a move and published at most every 250 ms; a move that changes no page row
// publishes nothing, so the message is said after this long in any case
const LAYOUT_WAIT_MS = 1000;

const EIGHTHS_PER_PAGE = 8;

const UNDO = Object.freeze({ label: "Undo", commandId: "edit.undo" });

// letters before or after a locked page's label, as either numbering scheme writes an A-page's
const LETTERS = /^[A-Z]+|[A-Z]+$/g;

/** Every block of the script, in document order. */
export function scriptBlocks(doc: CrdtDoc): BlockJSON[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
}

/** The last block of the row `row` stands for: a scene's last block, or the act break or Section itself. */
function lastBlockOf(blocks: readonly BlockJSON[], row: OutlineRow): string {
  if (row.kind !== "scene") return row.blockId;
  const start = blocks.findIndex((block) => block.attrs?.id === row.blockId);
  if (start === -1) return row.blockId;
  const next = blocks.findIndex(
    (block, index) =>
      index > start && SCENE_ENDS.has(String(block.attrs?.type)),
  );
  const last = blocks[(next === -1 ? blocks.length : next) - 1];
  return typeof last?.attrs?.id === "string" ? last.attrs.id : row.blockId;
}

/** The block the scene at `from` lands after once it takes the place `to` among `rows`; null: the script's start. */
function landingAfter(
  doc: CrdtDoc,
  rows: readonly OutlineRow[],
  from: number,
  to: number,
): string | null {
  const blocks = scriptBlocks(doc);
  const others = rows.filter((_row, index) => index !== from);
  if (from > to) {
    const after = others[to];
    if (after === undefined) return null;
    const afterIdx = blocks.findIndex(
      (block) => block.attrs?.id === after.blockId,
    );
    if (afterIdx <= 0) return null;
    const prevId = blocks[afterIdx - 1]?.attrs?.id;
    return typeof prevId === "string" ? prevId : null;
  }
  const before = others[to - 1];
  return before === undefined ? null : lastBlockOf(blocks, before);
}

const movedMessage = (text: string): Message => ({
  id: "scenes.moved",
  text,
  actions: [UNDO],
  lifetime: "reverse",
  ownWork: false,
});

/** The locked pages whose label gained a letter between `before` and the pages as they are now, in page order. */
function gainingPages(
  pages: ProductionPagesSelectors,
  before: ReadonlySet<string>,
): string[] {
  const rows = Array.from({ length: pages.count() }, (_, index) =>
    pages.row(index),
  );
  const gained = new Set(
    rows.flatMap((row) =>
      row === null || before.has(row.label)
        ? []
        : [row.label.replace(LETTERS, "")],
    ),
  );
  return rows.flatMap((row) =>
    row !== null && row.locked && gained.has(row.label) ? [row.label] : [],
  );
}

function lockedText(scene: string, gaining: readonly string[]): string {
  const first = gaining[0];
  const last = gaining.at(-1);
  if (first === undefined || last === undefined)
    return SCENE_MOVE_WORDS.moved(scene);
  return first === last
    ? SCENE_MOVE_WORDS.movedGainingPage(scene, first)
    : SCENE_MOVE_WORDS.movedGainingPages(scene, first, last);
}

/** Says the move once the pages are laid out after it: which locked pages gain A-pages, if any. */
function sayAfterLayout(
  messages: MessageQueue,
  scene: string,
  pages: ProductionPagesSelectors,
  before: ReadonlySet<string>,
): void {
  let said = false;
  const say = (): void => {
    if (said) return;
    said = true;
    stop();
    clearTimeout(timer);
    messages.push(movedMessage(lockedText(scene, gainingPages(pages, before))));
  };
  const stop = pages.subscribe(say);
  const timer = setTimeout(say, LAYOUT_WAIT_MS);
}

/**
 * Moves the scene at `from` among the rows a list shows to the place `to`, as one undo step, and says so in the
 * message slot; a row that is no scene, or a script with no editor that can change it, does not move.
 */
export function moveSceneTo(options: {
  docId: string;
  rows: readonly OutlineRow[];
  from: number;
  to: number;
  messages: MessageQueue;
}): void {
  const { docId, rows, from, to, messages } = options;
  if (from === to) return;
  const row = rows[from];
  const editor = liveEditor(docId);
  if (row?.kind !== "scene" || editor === null || !editor.editable) return;
  const pages = productionServicesFor(docId)?.pages ?? null;
  const locked = productionContextActions.get(docId)?.locked === true;
  const before = new Set(
    Array.from(
      { length: pages?.count() ?? 0 },
      (_, index) => pages?.row(index)?.label ?? "",
    ),
  );
  const moved = moveScene(editor.doc, {
    headingId: row.blockId,
    afterBlockId: landingAfter(editor.doc, rows, from, to),
    ids: randomBlockId,
  });
  if (!moved.ok) return;
  const scene =
    row.number === null ? row.heading : SCENE_MOVE_WORDS.scene(row.number);
  if (locked && pages !== null) sayAfterLayout(messages, scene, pages, before);
  else messages.push(movedMessage(SCENE_MOVE_WORDS.moved(scene)));
}

/** What a list's move announcements call a row: a scene by its place and length in pages, an act or a Section by its heading. */
export function rowLabel(row: OutlineRow): string {
  if (row.kind !== "scene") return row.heading;
  const place =
    row.number === null
      ? row.heading
      : PLACE_WORDS.scene(row.number, row.heading);
  if (row.eighths === null) return place;
  return row.eighths === EIGHTHS_PER_PAGE
    ? SCENE_MOVE_WORDS.namedOnePage(place)
    : SCENE_MOVE_WORDS.named(place, SCENES_WORDS.length(row.eighths));
}

/** The rows currently shown by the active movable scenes list or card grid, for the Move row menu. */
export const SceneRowsContext = createContext<readonly OutlineRow[] | null>(
  null,
);

/** The shown list of scenes, as the move commands reach it. */
interface SceneMover {
  /** Moves the focused scene by `by` places; false when no scene of the list is focused. */
  move(by: number): boolean;
}

let shown: SceneMover | null = null;

/** False when no list of scenes is shown, or none of its scenes is focused. */
export function moveFocusedScene(by: number): boolean {
  return shown?.move(by) ?? false;
}

const MOVE_COMMANDS: readonly string[] = Object.freeze([
  "scene.moveUp",
  "scene.moveDown",
]);

/** The element a person focuses to drag the item `item`, as the sortable list finds it. */
const handleIn = (item: Element): HTMLElement | null => {
  const inner = item.querySelector("[tabindex]");
  if (inner instanceof HTMLElement) return inner;
  return item instanceof HTMLElement ? item : null;
};

const itemOf = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest("[data-sortable-id]") : null;

/** Whether `target` is the handle of the item it is in. */
function isHandle(target: EventTarget | null): boolean {
  const item = itemOf(target);
  return item !== null && handleIn(item) === target;
}

/** What the element around a sortable list of scenes, and the list itself, are given to move them. */
interface SceneMoves {
  area: {
    ref: RefObject<HTMLDivElement | null>;
    onKeyDownCapture(event: ReactKeyboardEvent): void;
  };
  sortable: {
    ref: RefObject<SortableListHandle | null>;
    items: readonly { id: string; label: string }[];
    onMove(from: number, to: number): void;
  };
  /** The row an item of the list stands for; null for an id no row holds. */
  rowOf(id: string): OutlineRow | null;
}

/**
 * What a sortable list of the outline's `rows` needs to move scenes: where it is, its handle, its drop, and its keys.
 * While shown it is the list the move commands reach. Their keys are heard here, before the list's own arrow keys;
 * Enter on a row stays the row's own (going to the scene), so only Space picks a scene up.
 */
export function useSceneMoves(options: {
  docId: string;
  rows: readonly OutlineRow[];
}): SceneMoves {
  const { docId, rows } = options;
  const { messages } = useServices();
  const { service, resolved } = useCommands();
  const area = useRef<HTMLDivElement | null>(null);
  const list = useRef<SortableListHandle | null>(null);
  const resolve = useMemo(
    () =>
      createKeyResolver({
        table: () =>
          MOVE_COMMANDS.flatMap((id) =>
            (resolved.get().effective.get(id) ?? []).map((chord) => ({
              id,
              chord,
            })),
          ),
      }),
    [resolved],
  );
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    const mover: SceneMover = {
      move(by) {
        const current = rowsRef.current;
        const focused = itemOf(document.activeElement);
        const focusedId = focused?.getAttribute("data-sortable-id") ?? null;
        const index = area.current?.contains(focused)
          ? current.findIndex((row) => row.blockId === focusedId)
          : -1;
        if (current[index]?.kind !== "scene") return false;
        list.current?.move(index, by);
        return true;
      },
    };
    shown = mover;
    return () => {
      if (shown === mover) shown = null;
    };
  }, []);
  const prevItems = useRef<readonly { id: string; label: string }[]>([]);
  const items = useMemo(() => {
    const next = rows.map((row) => ({ id: row.blockId, label: rowLabel(row) }));
    const prev = prevItems.current;
    if (
      prev.length === next.length &&
      prev.every(
        (entry, index) =>
          entry.id === next[index]?.id && entry.label === next[index]?.label,
      )
    )
      return prev;
    prevItems.current = next;
    return next;
  }, [rows]);
  const prevById = useRef<ReadonlyMap<string, OutlineRow>>(new Map());
  const byId = useMemo(() => {
    const prev = prevById.current;
    if (
      prev.size === rows.length &&
      rows.every((row) => prev.get(row.blockId) === row)
    )
      return prev;
    const next = new Map(rows.map((row) => [row.blockId, row]));
    prevById.current = next;
    return next;
  }, [rows]);
  const onKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent): void => {
      const id = resolve(event.nativeEvent);
      // while a scene is dragged its keys are the drag's
      const dragging =
        event.currentTarget.querySelector("[data-dragging]") !== null;
      if (id !== null && !dragging) {
        event.preventDefault();
        event.stopPropagation();
        service.run(id, "key");
        return;
      }
      if (event.key === "Enter" && !dragging && isHandle(event.target))
        event.preventDefault();
    },
    [resolve, service],
  );
  const onMove = useCallback(
    (from: number, to: number): void =>
      moveSceneTo({ docId, rows: rowsRef.current, from, to, messages }),
    [docId, messages],
  );
  const rowOf = useCallback(
    (id: string): OutlineRow | null => byId.get(id) ?? null,
    [byId],
  );
  return {
    area: { ref: area, onKeyDownCapture },
    sortable: {
      ref: list,
      items,
      onMove,
    },
    rowOf,
  };
}
