// The test build's gallery: each surface drawn by its own component over ports made here, once per state they reach.
// `?surface=` draws one surface alone: a modal one, which makes the rest of the page inert, or a panel, whose tab is the window's.
import { COMMANDS } from "@manent/commands";
import type { SurfaceId } from "@manent/commands";
import { DEMO_PEOPLE, DEMO_WORKSPACES } from "@manent/demo";
import type { SignInChoice } from "@manent/sync-protocol";
import {
  ConsequenceDialog,
  LIBRARY_WORDS,
  Popover,
  SYNC_CENTRE_WORDS,
  createValue,
} from "@manent/ui";
import type { StatusFacts, SurfaceStateValue } from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Api, MeResult } from "../../api.ts";
import {
  ServicesProvider,
  useEnvironment,
  useServices,
} from "../../services/context.tsx";
import { createLocalDocumentSource } from "../../services/local-document-source.ts";
import type {
  DocumentServices,
  DocumentSource,
  Flags,
} from "../../services/ports.ts";
import type { TabPerson } from "../../session.ts";
import { SidePosition } from "../../shell/side-position.tsx";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import type {
  OutlineRow,
  OutlineSelectors,
} from "../../state/outline.store.ts";
import { paletteActions } from "../../state/palette.store.ts";
import { panelsActions } from "../../state/panels.store.ts";
import { ChooseScreen } from "../choose.tsx";
import { DocumentFrame } from "../document/document-screen.tsx";
import { LeftPanel } from "../document/left-panel.tsx";
import { SidePanel } from "../document/side-panel.tsx";
import { SIDE_PANEL_TABS } from "../document/side-tabs.ts";
import { SyncCentre } from "../document/sync-centre.tsx";
import { LibraryScreen } from "../library/library-screen.tsx";
import { Pane } from "../preferences/pane.tsx";
import { SendLayout } from "../send/send-frame.tsx";
import { testSendForm } from "../send/test-form.tsx";
import { createFixtureLibrary } from "./fixture-library.ts";

type StateKind = SurfaceStateValue["kind"];
type Waiting = readonly { scene: string; count: number }[];

// each section's one document
const DOC_ID = "00000000-0000-4000-8000-000000000001";
// the Tour is never opened by a section's Library
const SEEN: Flags = Object.freeze({ has: () => true, set() {} });
const NEVER = (): Promise<never> => new Promise(() => {});
const REFUSED = (): Promise<never> =>
  Promise.reject(new Error("the fixture server cannot be reached"));
const NAME = DEMO_PEOPLE.find((person) => person.userId === "you")?.name ?? "";
const SIGNED_OUT: TabPerson = Object.freeze({
  token: null,
  userId: "you",
  name: NAME,
});
const signedIn = (userId: string): TabPerson => ({
  token: "fixture",
  userId,
  name: NAME,
});
const noop = (): void => {};
// a section is named for its surface and its state ("library · empty"), the name the tests find it by
const sectionLabel = (surface: SurfaceId, state: StateKind): string =>
  `${surface} · ${state}`;

const fixtureApi = (options: {
  choices?: () => Promise<readonly SignInChoice[]>;
  me?: () => Promise<MeResult>;
}): Api => ({
  choices: options.choices ?? NEVER,
  me: options.me ?? NEVER,
  signIn: NEVER,
  demo: async () => null,
  removedDoc: async () => null,
  docClients: async () => ({ clients: [] }),
  prepareTour: NEVER,
  writers: NEVER,
  rebuild: NEVER,
});

interface Row {
  surface: SurfaceId;
  state: StateKind;
  draw(doc: DocumentServices): ReactNode;
  /** Laid over the local status of the section's one document. */
  facts: Partial<StatusFacts>;
  waiting: Waiting;
  /** New films in the section's Library, for the person with no session. */
  projects: number;
}

const row = (
  surface: SurfaceId,
  state: StateKind,
  draw: Row["draw"],
  ports: {
    facts?: Partial<StatusFacts>;
    waiting?: Waiting;
    projects?: number;
  } = {},
): Row => ({
  surface,
  state,
  draw,
  facts: {},
  waiting: [],
  projects: 0,
  ...ports,
});

/** One section over the tab's services, with its own query cache and one document, whose local status `facts` overlay. */
function FixtureSection(props: { row: Row }): ReactNode {
  const { surface, state, draw, facts, waiting, projects } = props.row;
  const services = useServices();
  const { now, where, randomId } = useEnvironment();
  const [fixture] = useState(() => {
    const local = createLocalDocumentSource({ now, shell: where.shell }).open(
      DOC_ID,
    );
    const doc: DocumentServices = {
      ...local,
      status: createValue({ ...local.status.get(), ...facts }),
      waitingByScene: createValue(waiting),
    };
    const documents: DocumentSource = { open: () => doc, close: noop };
    const library = createFixtureLibrary({ count: projects, ids: randomId });
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return { doc, queries, patch: { library, documents, flags: SEEN } };
  });
  const fixed = useMemo(
    () => ({ ...services, ...fixture.patch }),
    [services, fixture],
  );
  return (
    <section
      aria-label={sectionLabel(surface, state)}
      className="flex min-h-0 shrink-0 border-b border-line"
    >
      <QueryClientProvider client={fixture.queries}>
        <ServicesProvider services={fixed}>
          <div className="flex min-w-0 flex-1 flex-col">
            {draw(fixture.doc)}
          </div>
        </ServicesProvider>
      </QueryClientProvider>
    </section>
  );
}

const library =
  (person: TabPerson, me?: () => Promise<MeResult>) => (): ReactNode => (
    <LibraryScreen api={fixtureApi({ me })} person={person} />
  );
const choose =
  (choices: () => Promise<readonly SignInChoice[]>) => (): ReactNode => (
    <ChooseScreen
      api={fixtureApi({ choices })}
      person={null}
      setPerson={noop}
      next="/"
    />
  );
const frame = (): ReactNode => <DocumentFrame docId={DOC_ID} />;
// the Sync centre draws in its popover; closed, the popover's root still names its title
const syncCentre = (doc: DocumentServices): ReactNode => (
  <Popover>
    <div className="flex flex-col gap-2 p-4 text-ui">
      <SyncCentre doc={doc} />
    </div>
  </Popover>
);
const pane = (persisted: boolean) => (): ReactNode => (
  <Pane
    pane="writing"
    deviceName={null}
    persisted={persisted}
    onShortcuts={noop}
  />
);
const send = (): ReactNode => (
  <SendLayout place={{ name: LIBRARY_WORDS.title, back: noop }} side={null}>
    <testSendForm.Body docId={DOC_ID} />
  </SendLayout>
);
const sidePanel = (): ReactNode => <SidePanel docId={DOC_ID} overlay={false} />;
const outlined = (outline: OutlineSelectors) => (): ReactNode => (
  <OutlineContext value={outline}>
    <LeftPanel docId={DOC_ID} overlay={false} />
  </OutlineContext>
);
const outlineOf = (
  rowAt: (index: number) => OutlineRow | null,
  count: number,
): OutlineSelectors => ({
  count: () => count,
  row: rowAt,
  subscribe: () => noop,
});
const SCENES: readonly OutlineRow[] = DEMO_WORKSPACES.map(
  (workspace, index) => ({
    blockId: workspace.id,
    number: String(index + 1),
    heading: workspace.name.toUpperCase(),
    omitted: false,
    current: index === 0,
  }),
);
const VIEW_ONLY = Object.freeze({ access: "view" });

const EVERY_SURFACE: readonly Row[] = [
  row("library", "ready", library(SIGNED_OUT), { projects: 1 }),
  row("library", "empty", library(SIGNED_OUT)),
  row("library", "loading", library(signedIn("loading"), NEVER)),
  row("library", "problem", library(signedIn("problem"), REFUSED)),
  row(
    "choose",
    "ready",
    choose(async () => DEMO_PEOPLE),
  ),
  row("choose", "loading", choose(NEVER)),
  row("choose", "problem", choose(REFUSED)),
  row("document", "ready", frame),
  row("document", "read_only", frame, { facts: VIEW_ONLY }),
  row("document", "offline", frame, {
    facts: { neverSynced: false, network: "offline" },
  }),
  row("document", "problem", frame, { facts: { device: "failing" } }),
  row("document", "no_access", frame, {
    facts: { neverSynced: false, server: "access_removed", notSent: 3 },
  }),
  row("sync_centre", "ready", syncCentre),
  row("sync_centre", "empty", syncCentre, { facts: { neverSynced: false } }),
  row("sync_centre", "problem", syncCentre, {
    facts: { device: "failing", network: "offline" },
  }),
  row("sync_centre", "offline", syncCentre, {
    facts: { neverSynced: false, server: "unreachable", waiting: 12 },
    waiting: [{ scene: "8", count: 12 }],
  }),
  row("preferences", "ready", pane(true)),
  row("preferences", "problem", pane(false)),
  row("send", "ready", send),
];

/** The address's parameter `name`; null when it has none. */
const useSearchParam = (name: string): string | null =>
  useRouterState({
    select: (state): string | null =>
      new URLSearchParams(state.location.searchStr).get(name),
  });

/**
 * The dialog, open, as `?variant=` asks: plain (the default), with its alternative, with a refusal or with its action
 * disabled for a reason. One at a time, since each one open makes the rest of the page inert, other dialogs included.
 */
function ConsequenceDialogPage(): ReactNode {
  const variant = useSearchParam("variant");
  const signIn = COMMANDS.find((command) => command.id === "app.signInToSync");
  if (signIn === undefined || typeof signIn.label !== "string") return null;
  return (
    <ConsequenceDialog
      open
      title={signIn.label}
      titledBy="command"
      body={SYNC_CENTRE_WORDS.neverSynced(false)}
      action={signIn.label}
      busyLabel={null}
      refusal={variant === "refusal" ? LIBRARY_WORDS.problem : null}
      disabledReason={variant === "disabled" ? signIn.whyNot?.() : undefined}
      alternative={
        variant === "alternative"
          ? { label: SYNC_CENTRE_WORDS.exportCopy, onAction: noop }
          : undefined
      }
      destructive={false}
      onAction={noop}
      onCancel={noop}
    />
  );
}

/** Opens `panel` at `tab` while the page is drawn, so each section's panel of that kind shows it. */
const openPanel = (panel: "left" | "side", tab: string) => (): (() => void) => {
  panelsActions.open(panel, tab);
  return () => panelsActions.close(panel);
};

// a page's rows, what it opens while drawn, and what it draws outside any section
const PAGES: Readonly<
  Record<
    string,
    { rows: readonly Row[]; open(): () => void; Alone(): ReactNode }
  >
> = Object.freeze({
  left_panel: {
    rows: [
      row(
        "left_panel",
        "ready",
        outlined(outlineOf((index) => SCENES[index] ?? null, SCENES.length)),
      ),
      row("left_panel", "empty", outlined(outlineOf(() => null, 0))),
      row(
        "left_panel",
        "problem",
        outlined(
          outlineOf(() => {
            throw new Error("the fixture outline cannot be read");
          }, 1),
        ),
      ),
    ],
    open: openPanel("left", "scenes"),
    Alone: () => null,
  },
  side_panel: {
    rows: [
      row("side_panel", "ready", sidePanel),
      row("side_panel", "read_only", sidePanel, { facts: VIEW_ONLY }),
    ],
    open: openPanel("side", "details"),
    Alone: () => null,
  },
  tour: {
    rows: [
      row("side_panel", "ready", () => (
        <SidePosition docId={null} tabs={SIDE_PANEL_TABS} />
      )),
    ],
    open: openPanel("side", "tour"),
    Alone: () => null,
  },
  // the shell draws its one palette over the window
  palette: {
    rows: [],
    open() {
      paletteActions.open("all");
      return paletteActions.close;
    },
    Alone: () => null,
  },
  consequence_dialog: {
    rows: [],
    open: () => noop,
    Alone: ConsequenceDialogPage,
  },
});
const EVERY_PAGE = Object.freeze({
  rows: EVERY_SURFACE,
  open: () => noop,
  Alone: () => null,
});

/** Every surface in every state its ports reach; `?surface=` draws one of `PAGES` instead. */
export function StatesScreen(): ReactNode {
  const surface = useSearchParam("surface");
  const page = (surface === null ? undefined : PAGES[surface]) ?? EVERY_PAGE;
  useLayoutEffect(page.open, [page]);
  return (
    <div className="flex flex-col">
      {page.rows.map((each) => (
        <FixtureSection key={`${each.surface} ${each.state}`} row={each} />
      ))}
      <page.Alone />
    </div>
  );
}
