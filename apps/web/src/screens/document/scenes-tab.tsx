// The left panel's Scenes tab: the acts, sections and scenes of the outline, with a filter, named for the script's
// format; a row goes to its place in the page.
import {
  DOCUMENT_WORDS,
  Input,
  Row,
  SCENES_WORDS,
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
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import { useOutlineCount, useOutlineRow } from "../../state/outline.store.ts";
import type { OutlineRow } from "../../state/outline.store.ts";
import { panelRenderers } from "./panel-surface.tsx";
import { SCENE_MARK_SOURCES } from "./scene-marks.ts";

// the element picker's key, which the editor binds
const PICKER_CHORD = "Alt+Enter";
const READY = Object.freeze({ kind: "ready" });
const EMPTY = Object.freeze({ kind: "empty" });

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

/** Whether a scene heading is in a set of any source of scene marks, read again when a set changes. */
function useSceneMarks(docId: string): (blockId: string) => boolean {
  const sources = useMemo(
    () => SCENE_MARK_SOURCES.map((source) => source(docId)),
    [docId],
  );
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const stops = sources.map((source) => source.subscribe(changed));
    return () => {
      for (const stop of stops) stop();
    };
  }, [sources]);
  return (blockId) => sources.some((source) => source.get().has(blockId));
}

/** A scene's row: its number, heading and synopsis, then whether it is revised and its length. */
function SceneLine(props: {
  row: OutlineRow;
  marked: boolean;
  goTo: () => void;
}): ReactNode {
  const { row, marked, goTo } = props;
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
  const trailing = [
    ...(marked
      ? [
          <span key="revised" aria-hidden="true">
            *
          </span>,
        ]
      : []),
    ...(row.eighths === null
      ? []
      : [
          <span key="length" className="tabular-nums">
            {SCENES_WORDS.length(row.eighths)}
          </span>,
        ]),
  ];
  return (
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
    >
      {marked ? (
        <>
          <span aria-hidden="true">{row.heading}</span>
          <span className="sr-only">
            {DOCUMENT_WORDS.revisedName(row.heading)}
          </span>
        </>
      ) : (
        row.heading
      )}
    </Row>
  );
}

/** An act heads the scenes after it; a section groups them and is never printed. */
function OutlineLine(props: {
  index: number;
  isMarked: (blockId: string) => boolean;
}): ReactNode {
  const { editor } = useServices();
  const row = useOutlineRow(props.index);
  if (row === null) return null;
  const goTo = () =>
    void editor.run({ kind: "go_to", blockId: row.blockId, offset: 0 });
  if (row.kind === "scene")
    return (
      <SceneLine row={row} marked={props.isMarked(row.blockId)} goTo={goTo} />
    );
  return (
    <Row onActivate={goTo}>
      <span
        className={
          row.kind === "act" ? "font-semibold" : "text-fg-muted italic"
        }
      >
        {row.heading}
      </span>
    </Row>
  );
}

/** The outline's indices of the scenes whose heading or synopsis matches `filter`; every row while it is empty. */
function useShownRows(filter: string): readonly number[] | null {
  const outline = useContext(OutlineContext);
  const subscribe = useCallback(
    (listener: () => void) => outline?.subscribe(listener) ?? (() => {}),
    [outline],
  );
  const shown = useRef<readonly number[]>([]);
  const read = (): readonly number[] | null => {
    if (filter === "" || outline === null) return null;
    const indices: number[] = [];
    for (let index = 0; index < outline.count(); index++) {
      const row = outline.row(index);
      if (
        row?.kind === "scene" &&
        matchesQuery(filter, [row.heading, row.synopsis])
      )
        indices.push(index);
    }
    // the same list while it is unchanged, so the store sees no change
    const before = shown.current;
    if (
      before.length !== indices.length ||
      before.some((index, at) => index !== indices[at])
    )
      shown.current = indices;
    return shown.current;
  };
  return useSyncExternalStore(subscribe, read, read);
}

function ScenesList(props: { docId: string }): ReactNode {
  const { docId } = props;
  const { library } = useServices();
  const { platform } = useCommands();
  const format = useFormat(docId);
  const kindSource = useMemo(
    () => library.documentKind(docId),
    [library, docId],
  );
  const kind = useSubscribable(kindSource);
  const count = useOutlineCount();
  const isMarked = useSceneMarks(docId);
  const [filter, setFilter] = useState("");
  const shown = useShownRows(filter);
  return (
    <SurfaceState
      surface="left_panel"
      state={count === 0 ? EMPTY : READY}
      render={panelRenderers({
        ready: () => (
          <div className="flex min-h-0 flex-col">
            <div className="p-2">
              <Input
                type="search"
                aria-label={SCENES_WORDS.filter}
                placeholder={SCENES_WORDS.filter}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || filter === "") return;
                  event.preventDefault();
                  setFilter("");
                }}
                className="h-control text-ui"
              />
            </div>
            <VirtualRows
              count={shown === null ? count : shown.length}
              rowHeight="one"
              label={DOCUMENT_WORDS.leftTab(format)}
              renderRow={(index) => (
                <OutlineLine
                  index={shown?.[index] ?? index}
                  isMarked={isMarked}
                />
              )}
            />
          </div>
        ),
        empty: () => (
          <p className="p-4 text-ui text-fg-muted">
            {DOCUMENT_WORDS.scenesEmpty(
              format,
              kind,
              keyLabel(PICKER_CHORD, platform),
            )}
          </p>
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
