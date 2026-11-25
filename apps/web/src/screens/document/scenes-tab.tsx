// The left panel's Scenes tab: the acts, sections and scenes of the outline as a list or as cards, with a filter, named
// for the script's format; a row goes to its place in the page, moves by drag or key for a person who can edit, and
// draws what other features say of its scene.
import {
  DOCUMENT_WORDS,
  HISTORY_WORDS,
  Input,
  Row,
  SortableList,
  SurfaceState,
  VirtualRows,
  keyLabel,
  matchesQuery,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  BlankCard,
  SceneCards,
  ScenesSwitch,
  useScenesView,
} from "../../scenes/cards.tsx";
import type { ScenesView } from "../../scenes/cards.tsx";
import {
  ScenePeople,
  SceneTitle,
  isPersonMark,
  useSceneExtras,
} from "../../scenes/marks.tsx";
import type { SceneParts } from "../../scenes/marks.tsx";
import { useSceneMoves } from "../../scenes/moves.ts";
import { SceneRowMenu, rowItemsFor } from "../../scenes/row-menu.tsx";
import { SCENE_ROW_ITEMS } from "../../scenes/row-items.ts";
import { useServices } from "../../services/context.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import { useOutlineCount } from "../../state/outline.store.ts";
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

/**
 * A scene's row: its number, heading, synopsis and marks, then whether it is revised, the people in it, its length and
 * its menu.
 */
function SceneLine(props: {
  row: OutlineRow;
  parts: SceneParts;
  goTo: () => void;
}): ReactNode {
  const { row, parts, goTo } = props;
  if (row.omitted)
    return (
      <Row current={row.current} onActivate={goTo}>
        <span className="whitespace-pre text-fg-muted">
          {row.number === null
            ? DOCUMENT_WORDS.omitted
            : `${row.number}  ${DOCUMENT_WORDS.omitted}`}
        </span>
      </Row>
    );
  const marks = parts.extras.marks(row.blockId);
  const length = parts.extras.length(row);
  const trailing: ReactNode[] = [
    ...(marks.some((mark) => mark.kind === "revised")
      ? [
          <span key="revised" aria-hidden="true">
            *
          </span>,
        ]
      : []),
    // the people in the scene stand just before its length, in the same trailing item
    ...(length === null && !marks.some(isPersonMark)
      ? []
      : [
          <span key="length" className="flex items-center gap-2">
            <ScenePeople marks={marks} />
            {length === null ? null : (
              <span className="tabular-nums">{length}</span>
            )}
          </span>,
        ]),
  ];
  return (
    <SceneRowMenu
      docId={parts.docId}
      headingId={row.blockId}
      title={row.heading}
      items={parts.items}
    >
      {(handle) => (
        <Row
          current={row.current}
          onActivate={goTo}
          leading={
            row.number === null ? undefined : (
              <span className="w-6 text-end tabular-nums">{row.number}</span>
            )
          }
          meta={row.synopsis === "" ? undefined : row.synopsis}
          trailing={trailing}
          menu={handle ?? undefined}
        >
          <SceneTitle heading={row.heading} marks={marks} />
        </Row>
      )}
    </SceneRowMenu>
  );
}

/** An act or knot heads the entries after it; a stitch indents under its knot; a section groups scenes. */
function OutlineLine(props: { row: OutlineRow; parts: SceneParts }): ReactNode {
  const { row } = props;
  const { editor } = useServices();
  const goTo = () =>
    void editor.run({ kind: "go_to", blockId: row.blockId, offset: 0 });
  if (row.kind === "scene")
    return <SceneLine row={row} parts={props.parts} goTo={goTo} />;
  const textClass =
    row.kind === "act" || row.kind === "knot"
      ? "font-semibold"
      : row.kind === "stitch"
        ? "pl-4"
        : "text-fg-muted italic";
  return (
    <Row current={row.current} onActivate={goTo}>
      <span className={textClass}>{row.heading}</span>
    </Row>
  );
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
  rows: readonly OutlineRow[];
  renderRow(row: OutlineRow): ReactNode;
}): ReactNode {
  const moves = useSceneMoves({ docId: props.docId, rows: props.rows });
  return (
    <div {...moves.area} className="min-h-0 flex-1">
      <SortableList
        {...moves.sortable}
        orientation="vertical"
        renderItem={(id) => {
          const row = moves.rowOf(id);
          return row === null ? null : props.renderRow(row);
        }}
      />
    </div>
  );
}

/** The listed rows as the view shows them: movable for a person who can edit (never for Ink knots). */
function OutlineRows(props: {
  view: ScenesView;
  filter: string;
  label: string;
  canEdit: boolean;
  movable: boolean;
  parts: SceneParts;
}): ReactNode {
  const rows = useListedRows(props.filter);
  if (props.view === "cards")
    return (
      <SceneCards rows={rows} canEdit={props.canEdit} parts={props.parts} />
    );
  const renderRow = (row: OutlineRow): ReactNode => (
    <OutlineLine row={row} parts={props.parts} />
  );
  return props.movable ? (
    <MovableRows docId={props.parts.docId} rows={rows} renderRow={renderRow} />
  ) : (
    <div className="min-h-0 flex-1">
      <VirtualRows
        count={rows.length}
        rowHeight="one"
        label={props.label}
        renderRow={(index) => {
          const row = rows[index];
          return row === undefined ? null : renderRow(row);
        }}
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
  const extras = useSceneExtras(docId);
  const canEdit = useCanEdit(docId);
  const items = useMemo(() => rowItemsFor(SCENE_ROW_ITEMS, canEdit), [canEdit]);
  const parts: SceneParts = { docId, extras, items };
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
          <div className="@container flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 p-2">
              {viewSwitch}
              <Input
                type="search"
                aria-label={HISTORY_WORDS.filter}
                placeholder={HISTORY_WORDS.filter}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || filter === "") return;
                  event.preventDefault();
                  setFilter("");
                }}
                className="h-control min-w-0 flex-1 text-ui"
              />
            </div>
            <OutlineRows
              view={activeView}
              filter={filter}
              label={DOCUMENT_WORDS.leftTab(format)}
              canEdit={canEdit}
              movable={canEdit && !isInk}
              parts={parts}
            />
          </div>
        ),
        empty: () => (
          <div className="flex h-full min-h-0 flex-col">
            {viewSwitch === null ? null : (
              <div className="p-2">{viewSwitch}</div>
            )}
            {activeView === "cards" && canEdit ? (
              <div className="p-2">
                <BlankCard docId={docId} />
              </div>
            ) : (
              <p className="p-4 text-ui text-fg-muted">
                {DOCUMENT_WORDS.scenesEmpty(
                  format,
                  kind,
                  keyLabel(PICKER_CHORD, platform),
                )}
              </p>
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
