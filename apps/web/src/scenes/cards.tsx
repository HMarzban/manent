// The Scenes tab's Cards: its List / Cards switch and the choice it keeps, uniform full-width cards with inline
// synopsis editing, and the blank card after the last.
import type { KeyValueMap } from "@manent/settings";
import {
  Button,
  DOCUMENT_WORDS,
  SCENE_MOVE_WORDS,
  Segmented,
  SortableList,
} from "@manent/ui";
import {
  GripVerticalIcon,
  LayoutGridIcon,
  ListIcon,
  PencilIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createLocalMap } from "../services/local-map.ts";
import {
  useIsCurrentOutline,
  useIsViewedOutline,
} from "../state/outline.store.ts";
import type { OutlineRow } from "../state/outline.store.ts";
import { BlankCard } from "./blank-card.tsx";
import { useCardAutoFollow } from "./ghost-follow-bar.tsx";
import {
  SceneMetaMarks,
  ScenePeople,
  SceneTitle,
  isMetaMark,
} from "./marks.tsx";
import type { SceneParts } from "./marks.tsx";
import { SceneRowsContext, rowLabel, useSceneMoves } from "./moves.ts";
import { SceneRowMenu } from "./row-menu.tsx";

export { BlankCard };

const SCENES_VIEWS = ["list", "cards"] as const;
export type ScenesView = (typeof SCENES_VIEWS)[number];

const isScenesView = (value: unknown): value is ScenesView =>
  SCENES_VIEWS.some((view) => view === value);

const CARD = "mn-card flex h-full w-full flex-col gap-2 p-3 text-start text-ui";
const CARD_GRID =
  "@container grid grid-cols-1 gap-2.5 @[28rem]:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]";

const stopEvent = (event: SyntheticEvent): void => event.stopPropagation();

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
 * A scene's card: drag affordance, number badge, menu and synopsis edit, heading, marks, synopsis, people and length.
 * Activating it jumps to the scene; double-clicking or pressing F2 edits its synopsis in place.
 */
const SceneCard = memo(function SceneCard(props: {
  row: OutlineRow;
  parts: SceneParts;
  canEdit: boolean;
}): ReactNode {
  const { row, parts, canEdit } = props;
  const { editor } = useServices();
  const current = useIsCurrentOutline(row.blockId);
  const viewed = useIsViewedOutline(row.blockId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const canEditSynopsis = canEdit && !row.omitted;
  const goTo = (): void => {
    if (!editing)
      void editor.run({ kind: "go_to", blockId: row.blockId, offset: 0 });
  };
  const startEdit = (): void => {
    if (!canEditSynopsis) return;
    setDraft(row.synopsis);
    setEditing(true);
  };
  const commitEdit = (): void => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== row.synopsis)
      void editor.run({
        kind: "synopsis",
        blockId: row.blockId,
        text: trimmed,
      });
  };
  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      commitEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
  };
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
        const showEditButton = canEditSynopsis && !editing;
        const hasActions = handle !== null || showEditButton;
        const card = (
          <div
            role="group"
            tabIndex={0}
            aria-label={rowLabel(row)}
            aria-current={current ? "true" : undefined}
            data-viewed={viewed && !current ? "true" : undefined}
            data-outline-id={row.blockId}
            className={CARD}
            onClick={goTo}
            onDoubleClick={canEditSynopsis ? startEdit : undefined}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter") {
                event.preventDefault();
                goTo();
              } else if (event.key === "F2" && canEditSynopsis) {
                event.preventDefault();
                startEdit();
              }
            }}
          >
            <span className="flex min-h-control-sm items-center gap-1.5">
              {canEdit ? (
                <GripVerticalIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-fg-muted opacity-50 transition-opacity duration-(--dur-fast) group-hover/card:opacity-100 group-focus-within/card:opacity-100"
                />
              ) : null}
              {row.number === null ? null : (
                <span className="mn-scene-num">{row.number}</span>
              )}
              {marks.some((mark) => mark.kind === "revised") ? (
                <span
                  aria-hidden="true"
                  className="text-meta font-semibold text-fg-accent"
                >
                  *
                </span>
              ) : null}
              {hasActions ? (
                <span
                  aria-hidden="true"
                  className={
                    handle !== null && showEditButton
                      ? "ms-auto h-6 w-12 shrink-0"
                      : "ms-auto size-6 shrink-0"
                  }
                />
              ) : null}
            </span>
            <span
              id={`scene-card-title-${row.blockId}`}
              className="line-clamp-2 leading-snug font-semibold text-fg"
            >
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
            {editing ? (
              <div
                onClick={stopEvent}
                onPointerDown={stopEvent}
                onKeyDown={stopEvent}
              >
                <textarea
                  autoFocus
                  rows={2}
                  data-synopsis-input=""
                  aria-label={SCENE_MOVE_WORDS.editSynopsis}
                  placeholder={SCENE_MOVE_WORDS.addSynopsis}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={onEditKeyDown}
                  className="w-full resize-none rounded-control border border-focus bg-well px-2 py-1.5 text-meta leading-relaxed text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                />
              </div>
            ) : row.synopsis === "" ? null : (
              <span className="line-clamp-3 text-meta leading-relaxed text-fg-muted">
                {row.synopsis}
              </span>
            )}
            <span className="mt-auto flex items-center gap-2 border-t border-line pt-2 text-meta text-fg-muted tabular-nums">
              <ScenePeople marks={marks} />
              <span className="ms-auto" title={lengthTitle}>
                {length ?? SCENE_MOVE_WORDS.noPages}
              </span>
            </span>
          </div>
        );
        if (!hasActions) return card;
        return (
          <div data-row-menu className="group/card relative h-full w-full">
            {card}
            <span className="absolute top-2.5 end-2.5 flex flex-row-reverse items-center gap-0.5 opacity-80 transition-opacity duration-(--dur-fast) group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
              {handle}
              {showEditButton ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={SCENE_MOVE_WORDS.editSynopsis}
                  aria-describedby={`scene-card-title-${row.blockId}`}
                  title={SCENE_MOVE_WORDS.editSynopsis}
                  onClick={(event) => {
                    event.stopPropagation();
                    startEdit();
                  }}
                >
                  <PencilIcon aria-hidden="true" className="size-3.5" />
                </Button>
              ) : null}
            </span>
          </div>
        );
      }}
    </SceneRowMenu>
  );
});

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
  followBlockId?: string | null;
}): ReactNode {
  const { rows, canEdit, label, parts, followBlockId = null } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  useCardAutoFollow(containerRef, followBlockId);
  const scenes = useMemo(
    () => rows.filter((row) => row.kind === "scene"),
    [rows],
  );
  const renderCard = useCallback(
    (row: OutlineRow): ReactNode => (
      <SceneCard row={row} parts={parts} canEdit={canEdit} />
    ),
    [parts, canEdit],
  );
  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-2.5"
    >
      {canEdit ? (
        <MovableCards
          docId={parts.docId}
          label={label}
          scenes={scenes}
          renderCard={renderCard}
        />
      ) : (
        <div role="list" aria-label={label || undefined} className={CARD_GRID}>
          {scenes.map((row) => (
            <div key={row.blockId} role="listitem" className="min-w-0">
              {renderCard(row)}
            </div>
          ))}
        </div>
      )}
      {canEdit ? <BlankCard docId={parts.docId} /> : null}
    </div>
  );
}
