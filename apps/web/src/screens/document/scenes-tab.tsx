// The left panel's Scenes tab: the acts, sections and scenes of the outline as a list or as cards, with a filter, named
// for the script's format; a row goes to its place in the page, moves by drag or key for a person who can edit, and
// draws what other features say of its scene.
import {
  DOCUMENT_WORDS,
  SortableList,
  SurfaceState,
  VirtualRows,
  keyLabel,
  matchesQuery,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import type { NEW_PROJECT_CARDS } from "@manent/ui";
import { ListTreeIcon } from "lucide-react";
import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import {
  BlankCard,
  SceneCards,
  ScenesSwitch,
  useScenesView,
} from "../../scenes/cards.tsx";
import type { ScenesView } from "../../scenes/cards.tsx";
import { GhostFollowBar } from "../../scenes/ghost-follow-bar.tsx";
import { useSceneExtras } from "../../scenes/marks.tsx";
import type { SceneParts } from "../../scenes/marks.tsx";
import { SceneRowsContext, useSceneMoves } from "../../scenes/moves.ts";
import { OutlineLine } from "../../scenes/outline-line.tsx";
import { rowItemsFor } from "../../scenes/row-menu.tsx";
import { SCENE_ROW_ITEMS } from "../../scenes/row-items.ts";
import { ScenesFilterEmpty, ScenesToolbar } from "../../scenes/toolbar.tsx";
import { useServices } from "../../services/context.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import {
  useOutlineCount,
  useViewedOutlineId,
} from "../../state/outline.store.ts";
import type {
  OutlineRow,
  OutlineSelectors,
} from "../../state/outline.store.ts";
import { panelRenderers } from "./panel-surface.tsx";
import { useCanEdit } from "./ruler-bar.tsx";

// the element picker's key, which the editor binds
const PICKER_CHORD = "Alt+Enter";
const READY = Object.freeze({ kind: "ready" });
const EMPTY = Object.freeze({ kind: "empty" });
const NO_ROWS: readonly OutlineRow[] = Object.freeze([]);

/** The format of `docId`'s script; the default format while no document is open. */
function useFormat(docId: string | null): string {
  const services = useServices();
  const store =
    docId === null ? services.settings : services.openScriptStore(docId);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store.get("script.format"));
}

const isFilterableKind = (kind: OutlineRow["kind"]): boolean =>
  kind === "scene" || kind === "knot" || kind === "stitch";

/** The rows of `outline` shown under `filter`: matching scenes, knots and stitches; every row while it is empty. */
function listedRows(
  outline: OutlineSelectors | null,
  filter: string,
): readonly OutlineRow[] {
  if (outline === null) return NO_ROWS;
  const rows: OutlineRow[] = [];
  for (let index = 0; index < outline.count(); index++) {
    const row = outline.row(index);
    if (
      row !== null &&
      (filter === "" ||
        (isFilterableKind(row.kind) &&
          matchesQuery(filter, [row.heading, row.synopsis])))
    )
      rows.push(row);
  }
  return rows;
}

/** `listedRows`, read in render; the same list while no row of it changed, so the store sees no change. */
function useListedRows(filter: string): readonly OutlineRow[] {
  const outline = useContext(OutlineContext);
  const subscribe = useCallback(
    (listener: () => void) => outline?.subscribe(listener) ?? (() => {}),
    [outline],
  );
  const listed = useRef<readonly OutlineRow[]>(NO_ROWS);
  const read = (): readonly OutlineRow[] => {
    const rows = listedRows(outline, filter);
    const before = listed.current;
    if (
      before.length !== rows.length ||
      before.some((row, at) => row !== rows[at])
    )
      listed.current = rows;
    return listed.current;
  };
  return useSyncExternalStore(subscribe, read, read);
}

/** The rows of a person who can edit: a scene moves by drag, by its menu's Move, and by the move commands. */
function MovableRows(props: {
  docId: string;
  label: string;
  rows: readonly OutlineRow[];
  renderRow(row: OutlineRow): ReactNode;
  followIndex: number | null;
}): ReactNode {
  const { docId, label, rows, renderRow, followIndex } = props;
  const { area, sortable, rowOf } = useSceneMoves({ docId, rows });
  const renderItem = useCallback(
    (id: string): ReactNode => {
      const row = rowOf(id);
      return row === null ? null : renderRow(row);
    },
    [rowOf, renderRow],
  );
  return (
    <SceneRowsContext value={rows}>
      <div {...area} className="min-h-0 flex-1">
        <SortableList
          {...sortable}
          label={label}
          orientation="vertical"
          renderItem={renderItem}
          followIndex={followIndex}
        />
      </div>
    </SceneRowsContext>
  );
}

type Kind = (typeof NEW_PROJECT_CARDS)[number]["kind"];

/** The listed rows as the view shows them: movable for a person who can edit (never for Ink knots). */
function OutlineRows(props: {
  view: ScenesView;
  rows: readonly OutlineRow[];
  filter: string;
  onClearFilter(): void;
  format: string;
  kind: Kind | null;
  label: string;
  canEdit: boolean;
  movable: boolean;
  parts: SceneParts;
  followIndex: number | null;
  followBlockId: string | null;
}): ReactNode {
  const {
    rows,
    filter,
    onClearFilter,
    format,
    kind,
    parts,
    followIndex,
    followBlockId,
  } = props;
  const renderRow = useCallback(
    (row: OutlineRow): ReactNode => <OutlineLine row={row} parts={parts} />,
    [parts],
  );
  if (filter !== "" && rows.length === 0)
    return (
      <ScenesFilterEmpty format={format} kind={kind} onClear={onClearFilter} />
    );
  if (props.view === "cards")
    return (
      <SceneCards
        rows={rows}
        canEdit={props.canEdit}
        label={props.label}
        parts={parts}
        followBlockId={followBlockId}
      />
    );
  return props.movable ? (
    <MovableRows
      docId={parts.docId}
      label={props.label}
      rows={rows}
      renderRow={renderRow}
      followIndex={followIndex}
    />
  ) : (
    <div className="min-h-0 flex-1">
      <VirtualRows
        count={rows.length}
        rowHeight="one"
        label={props.label}
        followIndex={followIndex}
        renderRow={(index) => {
          const row = rows[index];
          return row === undefined ? null : renderRow(row);
        }}
      />
    </div>
  );
}

const countFilterable = (rows: readonly OutlineRow[]): number =>
  rows.filter((row) => isFilterableKind(row.kind)).length;

/** Ready body of the Scenes panel: reads outline rows only once the panel is ready, inside its boundary. */
function ScenesReady(props: {
  filter: string;
  onFilterChange(value: string): void;
  viewSwitch: ReactNode;
  view: ScenesView;
  format: string;
  kind: Kind | null;
  label: string;
  canEdit: boolean;
  movable: boolean;
  parts: SceneParts;
}): ReactNode {
  const {
    filter,
    onFilterChange,
    viewSwitch,
    view,
    format,
    kind,
    label,
    canEdit,
    movable,
    parts,
  } = props;
  const allRows = useListedRows("");
  const filteredRows = useListedRows(filter);
  const viewedId = useViewedOutlineId();
  const followBlockId = filter === "" ? viewedId : null;
  const followIndex = useMemo(() => {
    if (followBlockId === null) return null;
    const at = filteredRows.findIndex((row) => row.blockId === followBlockId);
    return at === -1 ? null : at;
  }, [filteredRows, followBlockId]);
  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <ScenesToolbar
        filter={filter}
        onFilterChange={onFilterChange}
        viewSwitch={viewSwitch}
        shownCount={countFilterable(filteredRows)}
        totalCount={countFilterable(allRows)}
        format={format}
        kind={kind}
      />
      <GhostFollowBar rows={allRows} />
      <OutlineRows
        view={view}
        rows={filteredRows}
        filter={filter}
        onClearFilter={() => onFilterChange("")}
        format={format}
        kind={kind}
        label={label}
        canEdit={canEdit}
        movable={movable}
        parts={parts}
        followIndex={followIndex}
        followBlockId={followBlockId}
      />
    </div>
  );
}

function ScenesList(props: { docId: string }): ReactNode {
  const { docId } = props;
  const { library } = useServices();
  const { platform } = useCommands();
  const format = useFormat(docId);
  const isInk = format === "ink";
  const kindSource = useMemo(
    () => library.documentKind(docId),
    [library, docId],
  );
  const kind = useSubscribable(kindSource);
  const count = useOutlineCount();
  const extras = useSceneExtras(docId, format);
  const canEdit = useCanEdit(docId);
  const items = useMemo(() => rowItemsFor(SCENE_ROW_ITEMS, canEdit), [canEdit]);
  const parts = useMemo<SceneParts>(
    () => ({ docId, extras, items }),
    [docId, extras, items],
  );
  const [filter, setFilter] = useState("");
  const { view, setView } = useScenesView();
  const activeView: ScenesView = isInk ? "list" : view;
  const viewSwitch = isInk ? null : (
    <ScenesSwitch view={view} onChange={setView} />
  );
  return (
    <SurfaceState
      surface="left_panel"
      state={count === 0 ? EMPTY : READY}
      render={panelRenderers({
        ready: () => (
          <ScenesReady
            filter={filter}
            onFilterChange={setFilter}
            viewSwitch={viewSwitch}
            view={activeView}
            format={format}
            kind={kind}
            label={DOCUMENT_WORDS.leftTab(format)}
            canEdit={canEdit}
            movable={canEdit && !isInk}
            parts={parts}
          />
        ),
        empty: () => (
          <div className="flex h-full min-h-0 flex-col">
            {viewSwitch === null ? null : (
              <div className="border-b border-line p-2">{viewSwitch}</div>
            )}
            {activeView === "cards" && canEdit ? (
              <div className="p-2.5">
                <BlankCard docId={docId} />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 overflow-y-auto p-3">
                <div className="flex min-h-full w-full flex-col items-center justify-center">
                  <EmptyHeroCard
                    compact
                    icon={
                      <ListTreeIcon aria-hidden="true" className="size-4" />
                    }
                    description={DOCUMENT_WORDS.scenesEmpty(
                      format,
                      kind,
                      keyLabel(PICKER_CHORD, platform),
                    )}
                  />
                </div>
              </div>
            )}
          </div>
        ),
      })}
    />
  );
}

function ScenesTab(props: { docId: string | null }): ReactNode {
  return props.docId === null ? null : <ScenesList docId={props.docId} />;
}

export const scenesTab: PanelTab<"scenes"> = {
  id: "scenes",
  useTab(docId) {
    const format = useFormat(docId);
    return {
      present: docId !== null,
      label: DOCUMENT_WORDS.leftTab(format),
    };
  },
  Tab: ScenesTab,
};
