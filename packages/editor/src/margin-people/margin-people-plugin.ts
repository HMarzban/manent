// Other people's initials in the desk gutter beside the sheet, level with the first line of the element holding
// their caret, the scenes they are in and who there is typing, and whose cursors the page draws. Placed from the
// sheets in view, never measured.
import type { LayoutBlock } from "@manent/pagination";
import { Plugin } from "prosemirror-state";
import type { PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { markPosition } from "../changes/layer.ts";
import {
  cursorsKey,
  isMoving,
  setShownCursors,
} from "../cursors/cursor-plugin.ts";
import type { ShownCursors } from "../cursors/cursor-plugin.ts";
import { blockNear, currentIndex } from "../cursors/place.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import type { CursorPlace, RemoteCursor } from "../script-editor/ports.ts";

export interface MarginPeopleOptions {
  /** Other people's cursors as presence reports them, at most 20 and only those with a caret; an empty list draws nobody. */
  subscribe(listener: (cursors: readonly RemoteCursor[]) => void): () => void;
  /** The accessible name of a marker for the people on its line, in their order. */
  name(names: readonly string[]): string;
  /** The page's factor, 1 at 100 %. */
  zoom(): number;
  /**
   * Told the people in each scene, by the block id of its heading and then by name, whenever who is in which scene
   * or who of them is moving changes; an empty map once the page goes.
   */
  onScenes(scenes: ReadonlyMap<string, readonly ScenePerson[]>): void;
  /** Whose cursors the page draws, set again at each presence report and whenever `subscribe` says it changed. */
  shown: { get(): ShownCursors; subscribe(listener: () => void): () => void };
}

/** A person in a scene, and whether they are typing: their caret moved within MOVING_MS. */
export interface ScenePerson {
  readonly cursor: RemoteCursor;
  readonly moving: boolean;
}

/** One person and the index of the block holding the head of their caret. */
interface Placed {
  readonly cursor: RemoteCursor;
  readonly block: number;
}

/** The people on one line, and where its marker stands: unzoomed px from the top left of the first sheet. */
interface Spot {
  readonly people: RemoteCursor[];
  readonly top: number;
  readonly left: number;
}

// a scene is opened by a heading, a slug or a chapter that has text, as the outline lists them
const OPENS_SCENE: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
  "chapter",
]);

/** One cursor per person: from the tab that moved last. */
function latestByPerson(cursors: readonly RemoteCursor[]): RemoteCursor[] {
  const latest = new Map<string, RemoteCursor>();
  for (const cursor of cursors) {
    const seen = latest.get(cursor.userId);
    if (seen === undefined || seen.movedAt <= cursor.movedAt)
      latest.set(cursor.userId, cursor);
  }
  return [...latest.values()];
}

const NONE_FOUND: ReadonlyMap<string, CursorPlace> = new Map();

/**
 * Each person whose head block is found near its hint in the index, or, while it is not, near the place `found` says
 * their caret was last drawn at: the caret and the person stay together.
 */
function placedOf(
  index: BlockIndex,
  cursors: readonly RemoteCursor[],
  found: ReadonlyMap<string, CursorPlace>,
): Placed[] {
  return cursors.flatMap((cursor) => {
    for (const place of [cursor.place, found.get(cursor.key)]) {
      const block =
        place === undefined
          ? null
          : blockNear(index, place.head.blockId, place.at);
      if (block !== null) return [{ cursor, block }];
    }
    return [];
  });
}

/** The pages whose sheets are drawn in `frame`. */
export function drawnPages(frame: HTMLElement, count: number): number[] {
  const pages = [...frame.querySelectorAll<HTMLElement>(".mn-sheet[data-page]")]
    .map((sheet) => Number(sheet.dataset["page"]))
    .filter((k) => Number.isInteger(k) && k >= 0 && k < count);
  return [...new Set(pages)].toSorted((a, b) => a - b);
}

/** Where the people whose element starts on a drawn page stand, one spot per line they share. */
function spotsOf(
  frame: HTMLElement,
  pages: PaginationState,
  placed: readonly Placed[],
): Spot[] {
  const { pagination, settings } = pages;
  const spots = new Map<string, Spot>();
  for (const k of drawnPages(frame, pagination.pages.length)) {
    const first = pagination.pages[k]!.block;
    const last = pagination.pages[k + 1]?.block ?? pagination.blocks.length - 1;
    const here = placed.filter((p) => p.block >= first && p.block <= last);
    if (here.length === 0) continue;
    const { lines } = settings.engine.layoutPage(pagination, k);
    for (const { cursor, block } of here) {
      const blockId = pagination.blocks[block]?.id;
      const line = lines.find(
        (l) => l.kind === "text" && l.blockLine === 0 && l.blockId === blockId,
      );
      if (line === undefined) continue;
      const at = markPosition(pagination.profile, k, line.y);
      const key = `${at.topPx}:${at.gutterPx}`;
      const spot = spots.get(key);
      if (spot === undefined)
        spots.set(key, { people: [cursor], top: at.topPx, left: at.gutterPx });
      else spot.people.push(cursor);
    }
  }
  return [...spots.values()];
}

/** The block id of the heading of the scene holding block `block`; null before the first scene. */
function sceneOf(blocks: readonly LayoutBlock[], block: number): string | null {
  for (let i = block; i >= 0; i--) {
    const { type, text, id } = blocks[i]!;
    if (OPENS_SCENE.has(type) && text.trim() !== "" && id !== null) return id;
  }
  return null;
}

const byName = (a: ScenePerson, b: ScenePerson): number =>
  a.cursor.name.localeCompare(b.cursor.name) ||
  a.cursor.userId.localeCompare(b.cursor.userId);

/** The people in each scene, by name, moving as of `now`, ms. */
function scenesOf(
  index: BlockIndex,
  placed: readonly Placed[],
  now: number,
): Map<string, ScenePerson[]> {
  const scenes = new Map<string, ScenePerson[]>();
  for (const { cursor, block } of placed) {
    const heading = sceneOf(index.blocks, block);
    if (heading === null) continue;
    const person = { cursor, moving: isMoving(cursor, now) };
    scenes.set(heading, [...(scenes.get(heading) ?? []), person]);
  }
  return new Map(
    [...scenes].map(([heading, people]) => [heading, people.toSorted(byName)]),
  );
}

/** A person's initials in their colour, or how many people share the line; a picture named by their names, never a control. */
function markerOf(
  doc: Document,
  spot: Spot,
  options: MarginPeopleOptions,
): HTMLElement {
  const { people } = spot;
  const [only] = people;
  const marker = doc.createElement("span");
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", options.name(people.map((p) => p.name)));
  if (people.length === 1 && only !== undefined) {
    marker.className = "mn-marker mn-avatar";
    marker.dataset["who"] = String(only.colour);
    marker.textContent = only.initials;
    marker.style.borderRadius = "50%";
  } else {
    marker.className = "mn-marker";
    marker.textContent = String(people.length);
  }
  Object.assign(marker.style, {
    position: "absolute",
    top: `${spot.top}px`,
    left: `${spot.left}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    font: "600 var(--type-micro) / var(--lh-micro) var(--face-ui)",
    pointerEvents: "none",
    transform: `scale(${1 / options.zoom()})`,
    transformOrigin: "0 0",
  });
  return marker;
}

// who is in which scene and moving, whatever the place of each caret inside it
const scenesKeyOf = (scenes: ReadonlyMap<string, readonly ScenePerson[]>) =>
  JSON.stringify(
    [...scenes].map(([id, people]) => [
      id,
      people.map(({ cursor: p, moving }) => [
        p.userId,
        p.name,
        p.initials,
        p.colour,
        moving,
      ]),
    ]),
  );

function marginPeopleView(
  view: EditorView,
  options: MarginPeopleOptions,
): PluginView {
  let people: readonly RemoteCursor[] = [];
  let drawn: HTMLElement[] = [];
  let markersKey = "";
  let scenesKey = scenesKeyOf(new Map());
  const tellScenes = (scenes: ReadonlyMap<string, readonly ScenePerson[]>) => {
    const next = scenesKeyOf(scenes);
    if (next === scenesKey) return;
    scenesKey = next;
    options.onScenes(scenes);
  };
  // moving as the carets were last judged
  const scenesIn = (index: BlockIndex | null, placed: readonly Placed[]) =>
    index === null
      ? new Map()
      : scenesOf(index, placed, cursorsKey.getState(view.state)?.now ?? 0);
  const placedIn = (index: BlockIndex | null): Placed[] =>
    index === null
      ? []
      : placedOf(
          index,
          people,
          cursorsKey.getState(view.state)?.found ?? NONE_FOUND,
        );
  const draw = () => {
    const frame = view.dom.parentElement;
    const pages = paginationKey.getState(view.state);
    const index = currentIndex(view.state);
    const placed = placedIn(index);
    tellScenes(scenesIn(index, placed));
    const spots =
      frame === null || pages === undefined
        ? []
        : spotsOf(frame, pages, placed);
    const next = JSON.stringify([options.zoom(), spots]);
    if (next === markersKey) return;
    markersKey = next;
    for (const marker of drawn) marker.remove();
    drawn =
      frame === null
        ? []
        : spots.map((spot) => markerOf(frame.ownerDocument, spot, options));
    frame?.append(...drawn);
  };
  // the filter is a transaction, so it is set when a report or a change arrives, never while the view is made
  const show = () => setShownCursors(view, options.shown.get());
  const stopShown = options.shown.subscribe(show);
  const stop = options.subscribe((cursors) => {
    people = latestByPerson(cursors);
    show();
    draw();
  });
  // the page scaffold names each sheet it draws, on scroll and zoom as well as when the pages change
  const sheets = new MutationObserver(draw);
  if (view.dom.parentElement !== null)
    sheets.observe(view.dom.parentElement, {
      subtree: true,
      attributeFilter: ["data-page"],
    });
  return {
    update(_, prev) {
      if (
        paginationKey.getState(prev)?.pagination !==
        paginationKey.getState(view.state)?.pagination
      )
        draw();
      // the carets were judged again: a person may have stopped moving
      else if (
        cursorsKey.getState(prev)?.now !== cursorsKey.getState(view.state)?.now
      ) {
        const index = currentIndex(view.state);
        tellScenes(scenesIn(index, placedIn(index)));
      }
    },
    destroy() {
      stop();
      stopShown();
      sheets.disconnect();
      for (const marker of drawn) marker.remove();
      tellScenes(new Map());
    },
  };
}

/**
 * Draws one marker per line holding the head of someone's caret, in the desk gutter beside the sheets in view: the
 * person's initials in their collaborator colour, or how many people share the line. A view without pages (Ink)
 * has no gutter and draws none, and tells no scenes. Whose cursors are drawn is `options.shown`'s.
 */
export function marginPeoplePlugin(options: MarginPeopleOptions): Plugin {
  return new Plugin({ view: (view) => marginPeopleView(view, options) });
}
