// The left panel's Scenes tab: one row per scene of the outline, named for the script's format.
import {
  DOCUMENT_WORDS,
  Row,
  SurfaceState,
  VirtualRows,
  keyLabel,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { useOutlineCount, useOutlineRow } from "../../state/outline.store.ts";
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

function SceneRow(props: {
  index: number;
  isMarked: (blockId: string) => boolean;
}): ReactNode {
  const row = useOutlineRow(props.index);
  if (row === null) return null;
  if (row.omitted)
    return (
      <Row current={row.current}>
        <span className="whitespace-pre text-fg-muted">
          {row.number === null
            ? DOCUMENT_WORDS.omitted
            : `${row.number}  ${DOCUMENT_WORDS.omitted}`}
        </span>
      </Row>
    );
  const marked = props.isMarked(row.blockId);
  return (
    <Row
      current={row.current}
      leading={
        row.number === null ? undefined : (
          <span className="w-6 text-end tabular-nums">{row.number}</span>
        )
      }
      trailing={
        marked
          ? [
              <span key="revised" aria-hidden="true">
                *
              </span>,
            ]
          : undefined
      }
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
  return (
    <SurfaceState
      surface="left_panel"
      state={count === 0 ? EMPTY : READY}
      render={panelRenderers({
        ready: () => (
          <VirtualRows
            count={count}
            rowHeight="one"
            label={DOCUMENT_WORDS.leftTab(format)}
            renderRow={(index) => (
              <SceneRow index={index} isMarked={isMarked} />
            )}
          />
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
