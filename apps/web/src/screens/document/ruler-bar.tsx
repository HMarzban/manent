// The Ruler's row between the state bar and the panels: the caret block's indent and right edge over the page's text column.
import { CELLS_PER_INCH } from "@manent/pagination";
import type { ElementStyle } from "@manent/settings";
import { DOC_ROLES, indexDocId } from "@manent/sync-protocol";
import {
  Button,
  PROJECT_WORDS,
  Ruler,
  SHARING_WORDS,
  useSubscribable,
} from "@manent/ui";
import type { Message, StatusFacts, Subscribable } from "@manent/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { PageFrame } from "../../editor-host/page-frame.ts";
import type { CaretElementInfo } from "../../editor-host/ruler-element.ts";
import { readPerson } from "../../session.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { useProductionContext } from "../../state/production-context.store.ts";
import { useRulerShown } from "../../state/ruler.store.ts";
import { useKeepPageStill } from "./document-state-bar.tsx";
import { useOpenDocument } from "./open-document.ts";

type RulerElementModule = typeof import("../../editor-host/ruler-element.ts");

const EMPTY_ENTRY: ElementStyle = Object.freeze({
  capitalized: null,
  underlined: null,
  bold: null,
  colour: null,
  spaceBefore: null,
  indent: null,
  width: null,
});

const RULER_AREA = Object.freeze({ gridArea: "ruler" });
const NOTHING: Subscribable<null> = Object.freeze({
  get: () => null,
  subscribe: () => () => {},
});

// the frame and caret element state are read through the live editor, which loads apart from the screens
const loadPageFrame = async () =>
  (await import("../../editor-host/page-frame.ts")).pageFrame;
const loadRulerElement = async (): Promise<RulerElementModule> =>
  import("../../editor-host/ruler-element.ts");

function toInches(cells: number): number {
  return Math.round(cells) / CELLS_PER_INCH;
}

function ProjectStyleProbe(props: {
  projectId: string;
  onOwner: (owner: boolean) => void;
}): null {
  const { projectId, onOwner } = props;
  const { userId } = useServices();
  const { tabStorage } = useEnvironment();
  useEffect(() => {
    let active = true;
    const person = readPerson(tabStorage);
    const token = person?.userId === userId ? person.token : null;
    void fetch("/api/docs/describe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ docId: indexDocId("project", projectId) }),
    })
      .then((res) => (res.status === 200 ? res.json() : null))
      .then((body: unknown) => {
        if (!active || typeof body !== "object" || body === null) return;
        const role = Reflect.get(body, "role");
        const caps = Reflect.get(body, "capabilities");
        if (!DOC_ROLES.some((known) => known === role) || !Array.isArray(caps))
          return;
        onOwner(role === "owner" || caps.includes("issue_revisions"));
      })
      .catch(() => {
        // leave default until answered; the server refuses a write the role may not make
      });
    return () => {
      active = false;
    };
  }, [projectId, tabStorage, userId, onOwner]);
  return null;
}

/** The page's frame for `docId` while `shown`; null until its code has loaded and while no paged editor of it is open. */
function usePageFrame(docId: string, shown: boolean): PageFrame | null {
  const [source, setSource] = useState<{
    docId: string;
    frame: Subscribable<PageFrame | null>;
  } | null>(null);
  useEffect(() => {
    let current = true;
    loadPageFrame()
      .then((pageFrame) => {
        if (current) setSource({ docId, frame: pageFrame(docId) });
      })
      .catch(() => {
        // without its code the bar stays empty; Details → Selection → Layout holds the same values
      });
    return () => {
      current = false;
    };
  }, [docId]);
  return useSubscribable<PageFrame | null>(
    shown && source?.docId === docId ? source.frame : NOTHING,
  );
}

/** This person's access to `docId`; null until its services are open. */
export function useAccess(docId: string): StatusFacts["access"] | null {
  const status = useOpenDocument(docId)?.status ?? null;
  // the status may be a new object at each read: only the answer is compared
  const subscribe = useCallback(
    (notify: () => void) => status?.subscribe(notify) ?? (() => {}),
    [status],
  );
  return useSyncExternalStore(subscribe, () => status?.get().access ?? null);
}

/** Whether this person may edit `docId`; false until its services are open. */
export function useCanEdit(docId: string): boolean {
  return useAccess(docId) === "edit";
}

/**
 * Drawn while the Ruler is on and the caret is in a block of a paged script; otherwise its row is empty and 0 px high.
 * Its appearing scrolls the page by its height in the same frame, so the line being read stays put. A drag sends one
 * layout action holding only the values it changed.
 */
export function RulerBar(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { editor } = services;
  const shown = useRulerShown();
  const columnCells = useEditorFact("columnCells");
  const indent = useEditorFact("blockIndent");
  const width = useEditorFact("blockWidth");
  const element = useEditorFact("element");
  const blockId = useEditorFact("blockId");
  const editable = useCanEdit(docId);
  const locked = useProductionContext(docId)?.locked === true;
  const projectSource = useMemo(
    () => services.library.documentProject(docId),
    [services, docId],
  );
  const projectId = useSubscribable(projectSource);
  const [projectOwner, setProjectOwner] = useState(true);
  const canWriteStyle = projectId !== null && projectOwner;
  const frame = usePageFrame(docId, shown);
  const [rulerMod, setRulerMod] = useState<RulerElementModule | null>(null);
  useEffect(() => {
    if (projectId === null || !shown || !editable || locked) return;
    let active = true;
    void loadRulerElement()
      .then((mod) => {
        if (active) setRulerMod(mod);
      })
      .catch(() => {
        // without the live editor helper, Apply to every stays hidden
      });
    return () => {
      active = false;
    };
  }, [projectId, shown, editable, locked]);

  const bar = useRef<HTMLDivElement>(null);
  const [barLeftPx, setBarLeftPx] = useState(0);
  useKeepPageStill(bar);
  useLayoutEffect(() => {
    if (bar.current !== null)
      setBarLeftPx(bar.current.getBoundingClientRect().left);
  }, [frame]);

  const drawn =
    shown &&
    columnCells !== null &&
    indent !== null &&
    width !== null &&
    frame !== null;

  const caretInfo: CaretElementInfo | null =
    drawn &&
    editable &&
    !locked &&
    canWriteStyle &&
    rulerMod !== null &&
    blockId !== null
      ? rulerMod.readCaretElementInfo(docId)
      : null;

  const differsFromElement =
    caretInfo !== null &&
    indent !== null &&
    width !== null &&
    (caretInfo.ownIndent !== null || caretInfo.ownWidth !== null) &&
    (indent !== caretInfo.elementIndent || width !== caretInfo.elementWidth);

  const promoteToElement = (
    info: CaretElementInfo,
    nextIndent: number,
    nextWidth: number,
    snapshots: ReturnType<RulerElementModule["snapshotSelectedOverrides"]>,
  ): void => {
    if (element === null || rulerMod === null) return;
    const store = services.openScriptStore(docId);
    const previous = store.get("project.style");
    const nextEntry: ElementStyle = {
      ...(previous[info.specKey] ?? EMPTY_ENTRY),
      indent: toInches(nextIndent),
      width: toInches(nextWidth),
    };
    const result = store.set("project.style", {
      ...previous,
      [info.specKey]: nextEntry,
    });
    if (!result.ok) return;
    editor.run({ kind: "layout", indent: null, width: null });
    const message: Message = {
      id: `apply_to_every_${info.specKey}`,
      text: PROJECT_WORDS.appliedToEvery(element),
      actions: [{ label: SHARING_WORDS.undo, commandId: "settings.undo" }],
      lifetime: "reverse",
      ownWork: false,
    };
    services.reverses.set(message.id, () => {
      store.set("project.style", previous);
      rulerMod.restoreBlockOverrides(docId, snapshots);
    });
    services.messages.push(message);
  };

  return (
    <div ref={bar} data-tour="ruler" style={RULER_AREA} className="relative">
      {projectId !== null ? (
        <ProjectStyleProbe projectId={projectId} onOwner={setProjectOwner} />
      ) : null}
      {drawn ? (
        <>
          <Ruler
            columnCells={columnCells}
            cellPx={frame.cellPx}
            originPx={frame.textLeftPx - barLeftPx}
            indent={indent}
            width={width}
            editable={editable}
            onCommit={(change) => {
              if (
                editable &&
                !locked &&
                canWriteStyle &&
                rulerMod !== null &&
                element !== null
              ) {
                const live = rulerMod.readCaretElementInfo(docId);
                if (live !== null && live.allBlocksSelected) {
                  const snapshots = rulerMod.snapshotSelectedOverrides(docId);
                  promoteToElement(
                    live,
                    change.indent,
                    change.width,
                    snapshots,
                  );
                  return;
                }
              }
              editor.run({
                kind: "layout",
                ...(change.indent === indent ? {} : { indent: change.indent }),
                ...(change.width === width ? {} : { width: change.width }),
              });
            }}
          />
          {differsFromElement && element !== null && caretInfo !== null ? (
            <Button
              variant="outline"
              size="sm"
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
              onClick={() =>
                promoteToElement(caretInfo, indent, width, [
                  {
                    blockId: caretInfo.blockId,
                    indent: caretInfo.ownIndent,
                    width: caretInfo.ownWidth,
                  },
                ])
              }
            >
              {PROJECT_WORDS.applyToEvery(element)}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
