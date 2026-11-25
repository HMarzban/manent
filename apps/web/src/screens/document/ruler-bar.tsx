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
import type { ReactNode, RefObject } from "react";
import type { PageFrame } from "../../editor-host/page-frame.ts";
import type { CaretElementInfo } from "../../editor-host/ruler-element.ts";
import { readPerson } from "../../session.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { PersonServices } from "../../services/ports.ts";
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

type PageFrameFn = (docId: string) => Subscribable<PageFrame | null>;

let cachedPageFrame: PageFrameFn | null = null;
let cachedRulerMod: RulerElementModule | null = null;
const projectOwnerCache = new WeakMap<PersonServices, Map<string, boolean>>();

// the frame and caret element state are read through the live editor, which loads apart from the screens
const loadPageFrame = (): Promise<PageFrameFn> =>
  cachedPageFrame !== null
    ? Promise.resolve(cachedPageFrame)
    : import("../../editor-host/page-frame.ts").then(
        (m) => (cachedPageFrame = m.pageFrame),
      );
const loadRulerElement = (): Promise<RulerElementModule> =>
  cachedRulerMod !== null
    ? Promise.resolve(cachedRulerMod)
    : import("../../editor-host/ruler-element.ts").then(
        (m) => (cachedRulerMod = m),
      );

const toInches = (cells: number): number => Math.round(cells) / CELLS_PER_INCH;

function ProjectStyleProbe(props: {
  docId: string;
  projectId: string;
  onOwner: (owner: boolean) => void;
}): null {
  const { docId, projectId, onOwner } = props;
  const { userId } = useServices();
  const { tabStorage } = useEnvironment();
  useEffect(() => {
    let active = true;
    const person = readPerson(tabStorage);
    const token = person?.userId === userId ? person.token : null;
    const describe = (id: string): Promise<unknown> =>
      fetch("/api/docs/describe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ docId: id }),
      }).then((res) => (res.status === 200 ? res.json() : null));
    void describe(indexDocId("project", projectId))
      .then((body) => (body === null ? describe(docId) : body))
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
  }, [docId, projectId, tabStorage, userId, onOwner]);
  return null;
}

/** The page's frame for `docId`; null until its code has loaded and while no paged editor of it is open. */
function usePageFrame(docId: string): PageFrame | null {
  const [source, setSource] = useState<{
    docId: string;
    frame: Subscribable<PageFrame | null>;
  } | null>(() =>
    cachedPageFrame === null ? null : { docId, frame: cachedPageFrame(docId) },
  );
  useEffect(() => {
    if (cachedPageFrame !== null) {
      const fn = cachedPageFrame;
      setSource((prev) =>
        prev?.docId === docId ? prev : { docId, frame: fn(docId) },
      );
      return;
    }
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
    source?.docId === docId ? source.frame : NOTHING,
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

/** Re-renders the bar when `script.style` changes (from Project settings, Apply to every, or Undo). */
function useScriptStyleRevision(docId: string, active: boolean): number {
  const services = useServices();
  const revision = useRef(0);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!active) return () => {};
      return services.openScriptStore(docId).subscribe("script.style", () => {
        revision.current += 1;
        notify();
      });
    },
    [active, docId, services],
  );
  return useSyncExternalStore(subscribe, () => revision.current);
}

/**
 * Drawn while the Ruler is on and the caret is in a block of a paged script; otherwise its row is empty and 0 px high.
 * Its appearing scrolls the page by its height in the same frame, so the line being read stays put. A drag sends one
 * layout action holding only the values it changed.
 */
function RulerBarContent(props: {
  docId: string;
  barRef: RefObject<HTMLDivElement | null>;
  onLayout: () => void;
}): ReactNode {
  const { docId, barRef, onLayout } = props;
  const services = useServices();
  const { editor } = services;
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
  const knownOwner =
    projectId === null
      ? null
      : (projectOwnerCache.get(services)?.get(projectId) ?? null);
  const [probedOwner, setProbedOwner] = useState<{
    projectId: string;
    owner: boolean;
  } | null>(null);
  const onOwner = useCallback(
    (owner: boolean) => {
      if (projectId === null) return;
      const byProject =
        projectOwnerCache.get(services) ?? new Map<string, boolean>();
      byProject.set(projectId, owner);
      projectOwnerCache.set(services, byProject);
      setProbedOwner({ projectId, owner });
    },
    [services, projectId],
  );
  const projectOwner =
    knownOwner ??
    (probedOwner?.projectId === projectId ? probedOwner.owner : false);
  const canWriteStyle = projectId !== null && projectOwner;
  const frame = usePageFrame(docId);
  const [rulerMod, setRulerMod] = useState<RulerElementModule | null>(
    () => cachedRulerMod,
  );
  useEffect(() => {
    if (projectId === null || !editable || locked || cachedRulerMod !== null)
      return;
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
  }, [projectId, editable, locked]);

  const [barLeftPx, setBarLeftPx] = useState(0);
  useLayoutEffect(onLayout);
  useLayoutEffect(() => {
    if (barRef.current !== null)
      setBarLeftPx(barRef.current.getBoundingClientRect().left);
  }, [frame, barRef]);

  const drawn =
    columnCells !== null && indent !== null && width !== null && frame !== null;

  const styleInteractive = drawn && editable && !locked && canWriteStyle;
  useScriptStyleRevision(docId, styleInteractive);

  const caretInfo: CaretElementInfo | null =
    styleInteractive && rulerMod !== null && blockId !== null
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
  ): boolean => {
    if (element === null || rulerMod === null) return false;
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
    if (!result.ok) return false;
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
    return true;
  };

  return (
    <>
      {projectId !== null && knownOwner === null ? (
        <ProjectStyleProbe
          docId={docId}
          projectId={projectId}
          onOwner={onOwner}
        />
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
                  if (
                    promoteToElement(
                      live,
                      change.indent,
                      change.width,
                      snapshots,
                    )
                  )
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
            <div className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-control bg-chrome">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (rulerMod === null) return;
                  promoteToElement(
                    caretInfo,
                    indent,
                    width,
                    rulerMod.snapshotSelectedOverrides(docId),
                  );
                }}
              >
                {PROJECT_WORDS.applyToEvery(element)}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/**
 * Drawn while the Ruler is on and the caret is in a block of a paged script; otherwise its row is empty and 0 px high.
 * While closed, none of the editor facts, page-frame imports, or style probes are mounted.
 */
export function RulerBar(props: { docId: string }): ReactNode {
  const shown = useRulerShown();
  const bar = useRef<HTMLDivElement>(null);
  const keepStill = useKeepPageStill(bar);
  return (
    <div ref={bar} data-tour="ruler" style={RULER_AREA} className="relative">
      {shown ? (
        <RulerBarContent
          docId={props.docId}
          barRef={bar}
          onLayout={keepStill}
        />
      ) : null}
    </div>
  );
}
