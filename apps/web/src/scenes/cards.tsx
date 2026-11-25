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
  useSubscribable,
} from "@manent/ui";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { liveEditor } from "../editor-host/live-editor.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createLocalMap } from "../services/local-map.ts";
import { useIsCurrentOutline } from "../state/outline.store.ts";
import type { OutlineRow } from "../state/outline.store.ts";
import {
  SceneMetaMarks,
  ScenePeople,
  SceneTitle,
  isMetaMark,
} from "./marks.tsx";
import type { SceneParts } from "./marks.tsx";
import {
  SceneRowsContext,
  rowLabel,
  scriptBlocks,
  useSceneMoves,
} from "./moves.ts";
import { SceneRowMenu } from "./row-menu.tsx";

const SCENES_VIEWS = ["list", "cards"] as const;
export type ScenesView = (typeof SCENES_VIEWS)[number];

const isScenesView = (value: unknown): value is ScenesView =>
  SCENES_VIEWS.some((view) => view === value);

const CARD =
  "mn-card flex w-full max-w-56 flex-col gap-1 p-3 text-start text-ui";

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
        options={[
          {
            value: "list",
            label: SCENE_MOVE_WORDS.list,
            icon: <ListIcon aria-hidden="true" className="size-3.5" />,
          },
          {
            value: "cards",
            label: SCENE_MOVE_WORDS.cards,
            icon: <LayoutGridIcon aria-hidden="true" className="size-3.5" />,
          },
        ]}
        onChange={(chosen) => {
          if (isScenesView(chosen)) props.onChange(chosen);
        }}
      />
    </div>
  );
}

/**
 * A scene's card: its number and menu, heading and marks, synopsis, the people in it and its length. It goes to the
 * scene, as a row does.
 */
const SceneCard = memo(function SceneCard(props: {
  row: OutlineRow;
  parts: SceneParts;
}): ReactNode {
  const { row, parts } = props;
  const { editor } = useServices();
  const current = useIsCurrentOutline(row.blockId);
  const goTo = () =>
    void editor.run({ kind: "go_to", blockId: row.blockId, offset: 0 });
  const marks = parts.extras.marks(row.blockId);
  const length = parts.extras.length(row);
  const lengthTitle =
    length === null
      ? undefined
      : (parts.extras.lengthTitle?.(row) ?? undefined);
  return (
    <SceneRowMenu
      docId={parts.docId}
      headingId={row.blockId}
      title={row.heading}
      items={parts.items}
    >
      {(handle) => {
        const card = (
          <div
            role="group"
            tabIndex={0}
            aria-label={rowLabel(row)}
            aria-current={current ? "true" : undefined}
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
              {marks.some((mark) => mark.kind === "revised") ? (
                <span aria-hidden="true">*</span>
              ) : null}
              {handle === null ? null : (
                <span aria-hidden="true" className="ms-auto size-6 shrink-0" />
              )}
            </span>
            <span className="line-clamp-2 font-semibold">
              {row.omitted ? (
                DOCUMENT_WORDS.omitted
              ) : (
                <SceneTitle heading={row.heading} marks={marks} />
              )}
            </span>
            {!row.omitted && marks.some(isMetaMark) ? (
              <span className="flex flex-wrap items-center gap-1">
                <SceneMetaMarks marks={marks} />
              </span>
            ) : null}
            {row.synopsis === "" ? null : (
              <span className="line-clamp-3 text-fg-muted">{row.synopsis}</span>
            )}
            <span className="flex items-center gap-2 text-meta text-fg-muted tabular-nums">
              <ScenePeople marks={marks} />
              <span title={lengthTitle}>
                {length ?? SCENE_MOVE_WORDS.noPages}
              </span>
            </span>
          </div>
        );
        if (handle === null) return card;
        return (
          <div data-row-menu className="relative w-full max-w-56">
            {card}
            <span className="absolute top-3 end-3 flex items-center">
              {handle}
            </span>
          </div>
        );
      }}
    </SceneRowMenu>
  );
});

const headingTypeFor = (
  format: string,
): "chapter" | "slug" | "scene_heading" =>
  format === "manuscript"
    ? "chapter"
    : format === "variety"
      ? "slug"
      : "scene_heading";

/** Writes a heading of the script's format with empty text and `synopsis` at the end of the script, as one undo step; false when the script cannot be changed here. */
function writeSceneCard(
  docId: string,
  synopsis: string,
  format: string,
): boolean {
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
          attrs: {
            id: randomBlockId(),
            type: headingTypeFor(format),
            synopsis,
          },
        },
      },
    ],
    ORIGIN_MATERIAL,
  );
  return true;
}

/** The card after the last: Enter writes what was typed there as a new scene's synopsis. */
export function BlankCard(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const store = services.openScriptStore(docId);
  const subscribeFormat = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  const format = useSyncExternalStore(subscribeFormat, () =>
    store.get("script.format"),
  );
  const kindSource = useMemo(
    () => services.library.documentKind(docId),
    [services.library, docId],
  );
  const kind = useSubscribable(kindSource);
  const prompt = SCENE_MOVE_WORDS.describeFor(format, kind);
  const [text, setText] = useState("");
  return (
    <textarea
      data-new=""
      rows={3}
      aria-label={prompt}
      placeholder={prompt}
      value={text}
      className={`${CARD} resize-none placeholder:text-fg-muted`}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        const synopsis = text.trim();
        if (synopsis !== "" && writeSceneCard(docId, synopsis, format))
          setText("");
      }}
    />
  );
}

/** The cards of a person who can edit: a card moves by drag, by its menu's Move, and by the move commands. */
function MovableCards(props: {
  docId: string;
  label?: string;
  scenes: readonly OutlineRow[];
  renderCard(row: OutlineRow): ReactNode;
}): ReactNode {
  const { docId, label, scenes, renderCard } = props;
  const { area, sortable, rowOf } = useSceneMoves({ docId, rows: scenes });
  const renderItem = useCallback(
    (id: string): ReactNode => {
      const row = rowOf(id);
      return row === null ? null : renderCard(row);
    },
    [rowOf, renderCard],
  );
  return (
    <SceneRowsContext value={scenes}>
      <div {...area}>
        <SortableList
          {...sortable}
          label={label}
          orientation="grid"
          renderItem={renderItem}
        />
      </div>
    </SceneRowsContext>
  );
}

/** The scenes of `rows` as cards, then the blank card for a person who can edit. */
export function SceneCards(props: {
  rows: readonly OutlineRow[];
  canEdit: boolean;
  label?: string;
  parts: SceneParts;
}): ReactNode {
  const { rows, canEdit, label, parts } = props;
  const scenes = useMemo(
    () => rows.filter((row) => row.kind === "scene"),
    [rows],
  );
  const renderCard = useCallback(
    (row: OutlineRow): ReactNode => <SceneCard row={row} parts={parts} />,
    [parts],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-2">
      {canEdit ? (
        <MovableCards
          docId={parts.docId}
          label={label}
          scenes={scenes}
          renderCard={renderCard}
        />
      ) : (
        <div
          role="list"
          aria-label={label || undefined}
          className="flex flex-wrap gap-3"
        >
          {scenes.map((row) => (
            <div key={row.blockId} role="listitem">
              {renderCard(row)}
            </div>
          ))}
        </div>
      )}
      {canEdit ? <BlankCard docId={parts.docId} /> : null}
    </div>
  );
}
