// The Scenes tab's Cards: its List / Cards switch and the choice it keeps, a card per scene, and the blank card after
// the last, which writes a new scene heading with its synopsis.
import { ORIGIN_MATERIAL, applyBlockOpsAsOne } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { KeyValueMap } from "@manent/settings";
import {
  DOCUMENT_WORDS,
  SCENE_MOVE_WORDS,
  Segmented,
  SortableList,
} from "@manent/ui";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { liveEditor } from "../editor-host/live-editor.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createLocalMap } from "../services/local-map.ts";
import type { OutlineRow } from "../state/outline.store.ts";
import { SceneTitle } from "./marks.tsx";
import type { SceneParts } from "./marks.tsx";
import { rowLabel, scriptBlocks, useSceneMoves } from "./moves.ts";
import { SceneRowMenu } from "./row-menu.tsx";

const SCENES_VIEWS = ["list", "cards"] as const;
export type ScenesView = (typeof SCENES_VIEWS)[number];

const isScenesView = (value: unknown): value is ScenesView =>
  SCENES_VIEWS.some((view) => view === value);

const VIEW_CHOICES = Object.freeze([
  { value: "list", label: SCENE_MOVE_WORDS.list },
  { value: "cards", label: SCENE_MOVE_WORDS.cards },
]);

const CARD = "mn-card flex w-56 flex-col gap-1 p-3 text-start text-ui";

// one map per person for the page's life, so every Scenes tab of theirs reads one choice and hears another tab's
const viewMaps = new Map<string, KeyValueMap>();

/** The person's List / Cards choice in `manent.view.scenes.<userId>`, `{ view }`, the same on every script; List until chosen. */
export function useScenesView(): {
  view: ScenesView;
  setView(view: ScenesView): void;
} {
  const { storage, storageEvents } = useEnvironment();
  const { userId } = useServices();
  const map = useMemo(() => {
    const held = viewMaps.get(userId);
    if (held !== undefined) return held;
    const made = createLocalMap({
      storage,
      key: `manent.view.scenes.${userId}`,
      events: storageEvents,
    });
    viewMaps.set(userId, made);
    return made;
  }, [storage, storageEvents, userId]);
  const subscribe = useCallback(
    (listener: () => void) => map.subscribe(listener),
    [map],
  );
  const read = (): ScenesView => {
    const view = map.get("view");
    return isScenesView(view) ? view : "list";
  };
  return {
    view: useSyncExternalStore(subscribe, read, read),
    setView: (view) => map.set("view", view),
  };
}

export function ScenesSwitch(props: {
  view: ScenesView;
  onChange(view: ScenesView): void;
}): ReactNode {
  return (
    <div data-tour="cards_switch" className="flex shrink-0">
      <Segmented
        label={SCENE_MOVE_WORDS.showAs}
        value={props.view}
        options={VIEW_CHOICES}
        onChange={(value) => {
          if (isScenesView(value)) props.onChange(value);
        }}
      />
    </div>
  );
}

/** A scene's card: its number and menu, heading and marks, synopsis and length. It goes to the scene, as a row does. */
function SceneCard(props: { row: OutlineRow; parts: SceneParts }): ReactNode {
  const { row, parts } = props;
  const { editor } = useServices();
  const goTo = () =>
    void editor.run({ kind: "go_to", blockId: row.blockId, offset: 0 });
  const marks = parts.extras.marks(row.blockId);
  return (
    <SceneRowMenu
      docId={parts.docId}
      headingId={row.blockId}
      title={row.heading}
      items={parts.items}
    >
      {(handle) => (
        <div
          role="group"
          tabIndex={0}
          aria-label={rowLabel(row)}
          aria-current={row.current ? "true" : undefined}
          className={CARD}
          onClick={goTo}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            goTo();
          }}
        >
          <span className="flex min-h-control-sm items-center gap-2 text-meta text-fg-muted tabular-nums">
            {row.number}
            <span className="ms-auto">{handle}</span>
          </span>
          <span className="line-clamp-2 font-semibold">
            {row.omitted ? (
              DOCUMENT_WORDS.omitted
            ) : (
              <SceneTitle heading={row.heading} marks={marks} />
            )}
          </span>
          {row.synopsis === "" ? null : (
            <span className="line-clamp-3 text-fg-muted">{row.synopsis}</span>
          )}
          <span className="text-meta text-fg-muted tabular-nums">
            {parts.extras.length(row) ?? SCENE_MOVE_WORDS.noPages}
          </span>
        </div>
      )}
    </SceneRowMenu>
  );
}

/** Writes a Scene Heading with empty text and `synopsis` at the end of the script, as one undo step; false when the script cannot be changed here. */
function writeSceneCard(docId: string, synopsis: string): boolean {
  const editor = liveEditor(docId);
  if (editor === null || !editor.editable) return false;
  const last = scriptBlocks(editor.doc).at(-1)?.attrs?.id;
  applyBlockOpsAsOne(
    editor.doc,
    [
      {
        op: "insert",
        after: typeof last === "string" ? last : null,
        block: {
          type: "block",
          attrs: { id: randomBlockId(), type: "scene_heading", synopsis },
        },
      },
    ],
    ORIGIN_MATERIAL,
  );
  return true;
}

/** The card after the last: Enter writes what was typed there as a new scene's synopsis. */
export function BlankCard(props: { docId: string }): ReactNode {
  const [text, setText] = useState("");
  return (
    <textarea
      data-new=""
      rows={3}
      aria-label={SCENE_MOVE_WORDS.describe}
      placeholder={SCENE_MOVE_WORDS.describe}
      value={text}
      className={`${CARD} resize-none placeholder:text-fg-muted`}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        const synopsis = text.trim();
        if (synopsis !== "" && writeSceneCard(props.docId, synopsis))
          setText("");
      }}
    />
  );
}

/** The cards of a person who can edit: a card moves by drag, by its menu's Move, and by the move commands. */
function MovableCards(props: {
  docId: string;
  scenes: readonly OutlineRow[];
  renderCard(row: OutlineRow): ReactNode;
}): ReactNode {
  const moves = useSceneMoves({ docId: props.docId, rows: props.scenes });
  return (
    <div {...moves.area}>
      <SortableList
        {...moves.sortable}
        orientation="grid"
        renderItem={(id) => {
          const row = moves.rowOf(id);
          return row === null ? null : props.renderCard(row);
        }}
      />
    </div>
  );
}

/** The scenes of `rows` as cards, then the blank card for a person who can edit. */
export function SceneCards(props: {
  rows: readonly OutlineRow[];
  canEdit: boolean;
  parts: SceneParts;
}): ReactNode {
  const { parts } = props;
  const scenes = useMemo(
    () => props.rows.filter((row) => row.kind === "scene"),
    [props.rows],
  );
  const card = (row: OutlineRow): ReactNode => (
    <SceneCard row={row} parts={parts} />
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-2">
      {props.canEdit ? (
        <MovableCards docId={parts.docId} scenes={scenes} renderCard={card} />
      ) : (
        <div role="list" className="flex flex-wrap gap-3">
          {scenes.map((row) => (
            <div key={row.blockId} role="listitem">
              {card(row)}
            </div>
          ))}
        </div>
      )}
      {props.canEdit ? <BlankCard docId={parts.docId} /> : null}
    </div>
  );
}
