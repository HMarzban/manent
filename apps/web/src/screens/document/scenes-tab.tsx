// The left panel's Scenes tab: the acts, sections and scenes of the outline, with a filter, named for the script's
// format; a row goes to its place in the page, and draws what other features say of its scene.
import {
  Avatar,
  Button,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  HISTORY_WORDS,
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
import type { Subscribable } from "@manent/ui";
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
import { SCENE_ROW_ITEMS } from "../../scenes/row-items.ts";
import { useServices } from "../../services/context.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import { useOutlineCount, useOutlineRow } from "../../state/outline.store.ts";
import type { OutlineRow } from "../../state/outline.store.ts";
import { panelRenderers } from "./panel-surface.tsx";
import { SCENE_LENGTH_SOURCES } from "./scene-lengths.ts";
import { SCENE_MARK_SOURCES } from "./scene-marks.ts";
import type { SceneMark } from "./scene-marks.ts";

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

/** The value of each of `sources` for `docId`, read again when one changes. */
function useSources<T>(
  sources: readonly ((docId: string) => Subscribable<T>)[],
  docId: string,
): readonly Subscribable<T>[] {
  const opened = useMemo(
    () => sources.map((source) => source(docId)),
    [sources, docId],
  );
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const stops = opened.map((source) => source.subscribe(changed));
    return () => {
      for (const stop of stops) stop();
    };
  }, [opened]);
  return opened;
}

// the order a row draws its marks in, whichever source gives them
const MARK_ORDER: Readonly<Record<SceneMark["kind"], number>> = Object.freeze({
  revised: 0,
  count: 1,
  person: 2,
  text: 3,
});

/** What a scene's row draws besides its heading: its marks in their order, and the text in place of its length. */
interface SceneExtras {
  marks(blockId: string): readonly SceneMark[];
  /** Null: the row shows its length in eighths. */
  length(blockId: string): string | null;
}

function useSceneExtras(docId: string): SceneExtras {
  const marks = useSources(SCENE_MARK_SOURCES, docId);
  const lengths = useSources(SCENE_LENGTH_SOURCES, docId);
  return {
    marks: (blockId) =>
      marks
        .flatMap((source) => source.get().get(blockId) ?? [])
        .toSorted((a, b) => MARK_ORDER[a.kind] - MARK_ORDER[b.kind]),
    length(blockId) {
      for (const source of lengths) {
        const text = source.get().get(blockId);
        if (text !== undefined) return text;
      }
      return null;
    },
  };
}

/** A mark other than revised, drawn after the heading. */
function Mark(props: {
  mark: Exclude<SceneMark, { kind: "revised" }>;
}): ReactNode {
  const { mark } = props;
  switch (mark.kind) {
    case "count":
      return (
        <span className="text-meta text-fg-muted tabular-nums">
          {mark.label} {mark.count}
        </span>
      );
    case "person":
      return (
        <Avatar
          name={mark.name}
          initials={mark.initials}
          colour={mark.colour}
          size="sm"
        />
      );
    case "text":
      return <span className="text-meta text-fg-muted">{mark.label}</span>;
  }
}

/** The handle of a scene's row menu, holding each item of SCENE_ROW_ITEMS. */
function SceneRowMenu(props: {
  docId: string;
  headingId: string;
  heading: string;
}): ReactNode {
  return (
    // the handle's own click and keys open the menu, never the row
    <span
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={DOCUMENT_WORDS.rowMenuName(props.heading)}
            />
          }
        >
          <span aria-hidden="true">⋯</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {SCENE_ROW_ITEMS.map(({ id, Item }) => (
            <Item key={id} docId={props.docId} headingId={props.headingId} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** A scene's row: its number, heading, synopsis and marks, then whether it is revised, its length and its menu. */
function SceneLine(props: {
  docId: string;
  row: OutlineRow;
  extras: SceneExtras;
  goTo: () => void;
}): ReactNode {
  const { docId, row, extras, goTo } = props;
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
  const marks = extras.marks(row.blockId);
  const marked = marks.some((mark) => mark.kind === "revised");
  const length =
    extras.length(row.blockId) ??
    (row.eighths === null ? null : SCENES_WORDS.length(row.eighths));
  const trailing = [
    ...(marked
      ? [
          <span key="revised" aria-hidden="true">
            *
          </span>,
        ]
      : []),
    ...(length === null
      ? []
      : [
          <span key="length" className="tabular-nums">
            {length}
          </span>,
        ]),
    ...(SCENE_ROW_ITEMS.length === 0
      ? []
      : [
          <SceneRowMenu
            key="menu"
            docId={docId}
            headingId={row.blockId}
            heading={row.heading}
          />,
        ]),
  ];
  const after = marks.flatMap((mark, index) =>
    mark.kind === "revised" ? [] : [<Mark key={index} mark={mark} />],
  );
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
      {after.length === 0 ? null : (
        <span className="ms-2 inline-flex gap-1 align-middle">{after}</span>
      )}
    </Row>
  );
}

/** An act heads the scenes after it; a section groups them and is never printed. */
function OutlineLine(props: {
  docId: string;
  index: number;
  extras: SceneExtras;
}): ReactNode {
  const { editor } = useServices();
  const row = useOutlineRow(props.index);
  if (row === null) return null;
  const goTo = () =>
    void editor.run({ kind: "go_to", blockId: row.blockId, offset: 0 });
  if (row.kind === "scene")
    return (
      <SceneLine
        docId={props.docId}
        row={row}
        extras={props.extras}
        goTo={goTo}
      />
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
  const extras = useSceneExtras(docId);
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
                aria-label={HISTORY_WORDS.filter}
                placeholder={HISTORY_WORDS.filter}
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
                  docId={docId}
                  index={shown?.[index] ?? index}
                  extras={extras}
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
