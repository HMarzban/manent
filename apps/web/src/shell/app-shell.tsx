// The one shell around every screen: the grid, the editor host, the palette, the global keys, the announcer and Escape.
import type { ScreenId } from "@manent/commands";
import {
  CommandsProvider,
  GlobalKeys,
  SettingsProvider,
  SurfaceBoundary,
  TimingProvider,
} from "@manent/ui";
import { useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { EditorHost } from "../editor-host/editor-host.tsx";
import { standInMount } from "../editor-host/stand-in-mount.ts";
import { useFileDrop } from "../import/file-drop.ts";
import { loadApart } from "../load-apart.ts";
import { historyTab } from "../screens/document/history-tab.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { readDeviceId } from "../services/device-id.ts";
import {
  FactsContext,
  OutlineContext,
  PeopleContext,
} from "../state/bridge-contexts.ts";
import { createFactsStore } from "../state/facts.store.ts";
import type { FactsSelectors, FactsWriter } from "../state/facts.store.ts";
import { createOutlineStore } from "../state/outline.store.ts";
import type { OutlineWriter } from "../state/outline.store.ts";
import { paletteActions, usePaletteOpen } from "../state/palette.store.ts";
import { usePanel } from "../state/panels.store.ts";
import { createPeopleStore } from "../state/people.store.ts";
import { AnnouncerRegion } from "./announcer-region.tsx";
import { useEscapeHandler } from "./escape-handler.ts";
import { useMenuChoiceFocus } from "./menu-focus.ts";
import { ShellRegion } from "./regions.tsx";
import { SHELL_SCREENS } from "./shell-screens.ts";
import type { ShellScreen } from "./shell-screens.ts";

const STAND_IN_ROUTE = "/__stand-in";
const UNLISTED: ShellScreen = Object.freeze({
  routeId: "",
  screen: "library",
  page: "covered",
});

const GRID: CSSProperties = Object.freeze({
  gridTemplateAreas: [
    '"demobar demobar demobar"',
    '"titlebar titlebar titlebar"',
    '"statebar statebar statebar"',
    '"findbar findbar findbar"',
    '"ruler ruler ruler"',
    '"left page side"',
    '"statusbar statusbar statusbar"',
  ].join(" "),
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  gridTemplateRows: "auto auto auto auto auto minmax(0, 1fr) auto",
});
// a screen that is not a document covers everything from the title bar to the status bar, the page included
const SCREEN_AREA: CSSProperties = Object.freeze({
  gridRow: "titlebar-start / statusbar-end",
  gridColumn: "1 / -1",
});

/** The row of SHELL_SCREENS for the route shown; a route with none shows the Library's screen id, covered. */
export function useShellScreen(): ShellScreen {
  const routeId = useRouterState({
    select: (state): string | null => state.matches.at(-1)?.routeId ?? null,
  });
  return SHELL_SCREENS.find((row) => row.routeId === routeId) ?? UNLISTED;
}

/** Which screen the route shows, the document under it (the stand-in's is made apart), and what it does with the page. */
function useShellRoute(): {
  screen: ScreenId;
  docId: string | null;
  page: ShellScreen["page"];
  standIn: boolean;
} {
  const { flavour } = useEnvironment();
  const { routeId, screen, page } = useShellScreen();
  // the Send screen keeps its document under it, covered
  const routeDocId = useRouterState({
    select: (state): string | null =>
      state.matches.at(-1)?.params.docId ?? null,
  });
  const standIn = flavour === "test" && routeId === STAND_IN_ROUTE;
  return {
    screen,
    docId: standIn ? null : routeDocId,
    // the stand-in's row is the test build's only
    page: routeId === STAND_IN_ROUTE && !standIn ? "covered" : page,
    standIn,
  };
}

/** The test build's stand-in document of this person on this device, once it is made; null until then and off its route. */
function useStandInDocId(standIn: boolean): string | null {
  const { userId } = useServices();
  const { storage, randomId, schedule } = useEnvironment();
  const [made, setMade] = useState<{ userId: string; docId: string } | null>(
    null,
  );
  useEffect(() => {
    if (!standIn) return;
    let stop: (() => void) | null = null;
    let live = true;
    void import("./stand-in-script.ts").then(({ makeStandInScript }) => {
      if (!live) return;
      stop = makeStandInScript({
        userId,
        deviceId: readDeviceId(storage, randomId),
        schedule,
        made: (docId) => setMade({ userId, docId }),
      });
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [standIn, userId, storage, randomId, schedule]);
  return standIn && made?.userId === userId ? made.docId : null;
}

/** Where the route's screen draws: over the frame while it is not a document; a document draws its parts in their own areas. */
export function ScreenArea(props: { children: ReactNode }): ReactNode {
  const { page } = useShellRoute();
  if (page !== "covered") return props.children;
  return (
    <div className="flex min-h-0 flex-col overflow-auto" style={SCREEN_AREA}>
      {props.children}
    </div>
  );
}

// the palette is loaded apart from the entry, which it would push over its size budget
const palette = loadApart(
  async () => (await import("./shell-palette.tsx")).ShellPalette,
);
const ShellPalette = palette.Component;
/** Starts loading the palette's code. */
export const preloadShellPalette = palette.preload;

/** The bridge's stores, made once for the life of the shell. */
function useBridgeStores() {
  const { guard, frame, schedule } = useEnvironment();
  const [stores] = useState(() => {
    // the outline and the people wait while an input method composes; the editor's bridge says when
    const throttled = { guard, schedule, composing: () => false };
    return {
      facts: createFactsStore({ guard, frame }),
      outline: createOutlineStore(throttled),
      people: createPeopleStore(throttled),
    };
  });
  return stores;
}

/** The editor host in the page: mounted once for the life of the shell, and covered, never unmounted, under a screen. */
function ShellPage(props: {
  docId: string | null;
  covered: boolean;
  bare: boolean;
  standIn: boolean;
  writers: { facts: FactsWriter; outline: OutlineWriter };
}): ReactNode {
  const { docId, covered, bare, standIn, writers } = props;
  const services = useServices();
  const { guard } = useEnvironment();
  useEffect(() => {
    if (docId === null) return;
    services.documents.open(docId);
    return () => services.documents.close(docId);
  }, [services, docId]);
  const ports = useMemo(
    () => ({
      ...writers,
      settings:
        docId === null ? services.settings : services.openScriptStore(docId),
      guard,
      bare,
    }),
    [writers, services, docId, guard, bare],
  );
  // covered, the page is inert, and a region that scrolls with nothing a key can reach is out of the keyboard's reach;
  // hidden, unlike clip, keeps the scroll offset for the way back
  return (
    <ShellRegion
      region="page"
      className={covered ? "min-h-0 overflow-hidden" : "min-h-0 overflow-auto"}
    >
      <EditorHost
        docId={docId}
        covered={covered}
        mount={standIn ? standInMount : services.mount}
        ports={ports}
      />
    </ShellRegion>
  );
}

/**
 * Writes what the shell knows of the window for the commands' context, whenever it changes. Whether the caret block has its own
 * space before is written as the fact changes, without a render, so a caret move never re-renders the shell.
 */
function usePublishShellState(
  screen: ScreenId,
  docId: string | null,
  facts: FactsSelectors,
): void {
  const { shellState } = useEnvironment();
  const left = usePanel("left").tab;
  const side = usePanel("side").tab;
  const historyPresent = historyTab.useTab(docId).present;
  useLayoutEffect(() => {
    shellState.set({
      screen,
      docId,
      panels: { left, side },
      historyPresent,
      spaceBeforeSet: facts.get("blockSpaceBeforeSet") === true,
    });
  }, [shellState, screen, docId, left, side, historyPresent, facts]);
  useEffect(
    () =>
      facts.subscribe("blockSpaceBeforeSet", (value) =>
        shellState.set({ ...shellState.get(), spaceBeforeSet: value === true }),
      ),
    [shellState, facts],
  );
}

/**
 * The grid every screen sits in, with areas `demobar`, `titlebar`, `statebar`, `findbar`, `ruler`, `left`, `page`,
 * `side` and `statusbar`, inside the providers of the person's settings and commands and of the bridge's stores.
 */
export function AppShell(props: { children: ReactNode }): ReactNode {
  const services = useServices();
  const { where, now, schedule, dom } = useEnvironment();
  const route = useShellRoute();
  const { screen, page, standIn } = route;
  const covered = page === "covered";
  const standInDocId = useStandInDocId(standIn);
  const docId = standIn ? standInDocId : route.docId;
  const { facts, outline, people } = useBridgeStores();
  const timing = useMemo(() => ({ now, schedule }), [now, schedule]);
  const writers = useMemo(
    () => ({ facts: facts.writer, outline: outline.writer }),
    [facts, outline],
  );
  const paletteOpen = usePaletteOpen() !== null;
  const closePalette = (): void => {
    paletteActions.close();
    dom.restoreFocus();
  };
  usePublishShellState(screen, docId, facts.selectors);
  useEscapeHandler({ dom, paletteOpen, closePalette });
  useMenuChoiceFocus();
  const drop = useFileDrop();
  return (
    <SettingsProvider store={services.settings}>
      <CommandsProvider
        service={services.commands}
        resolved={services.resolved}
        platform={where.platform}
      >
        <TimingProvider timing={timing}>
          <FactsContext value={facts.selectors}>
            <OutlineContext value={outline.selectors}>
              <PeopleContext value={people.selectors}>
                <div
                  className="grid h-screen overflow-x-clip bg-chrome text-fg"
                  style={GRID}
                  {...(screen === "reader" ? {} : drop)}
                >
                  <ShellPage
                    docId={docId}
                    covered={covered}
                    bare={page === "bare"}
                    standIn={standIn}
                    writers={writers}
                  />
                  {props.children}
                  <AnnouncerRegion />
                </div>
                {page === "bare" || screen === "reader" ? null : (
                  <>
                    {/* a palette whose code cannot load leaves the shell as it is */}
                    <SurfaceBoundary fallback={() => null}>
                      <Suspense fallback={null}>
                        <ShellPalette docId={docId} close={closePalette} />
                      </Suspense>
                    </SurfaceBoundary>
                    <GlobalKeys />
                  </>
                )}
              </PeopleContext>
            </OutlineContext>
          </FactsContext>
        </TimingProvider>
      </CommandsProvider>
    </SettingsProvider>
  );
}
