// One document's production for one person: the client of the state the authority sequences, the editor's port
// onto it, the person's view state, the Pages tab's store, and what the command context and the message slot read.
import {
  createHttpProductionTransport,
  createIdbProductionCache,
} from "@manent/client-web";
import type { PagesSink, ProductionPort, ProductionView } from "@manent/editor";
import { RECALL_WINDOW_MS } from "@manent/revisions";
import type { MarkMode } from "@manent/revisions";
import type { SettingKey } from "@manent/settings";
import { createProductionClient } from "@manent/sync-client";
import type {
  CachedProduction,
  DocHandle,
  ProductionCache,
  ProductionClient,
} from "@manent/sync-client";
import type { Capability, DocPeopleResponse } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import { watchImportLock } from "../import/lock-sender.ts";
import { browserStorage } from "../services/local-map.ts";
import { browserStores } from "../services/sync/device-memory.ts";
import { readPerson, tabStorage } from "../session.ts";
import type { Guard } from "../state/guard.ts";
import { guardWrite } from "../state/guard.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { createProductionPagesStore } from "../state/production-pages.store.ts";
import type { ProductionPagesSelectors } from "../state/production-pages.store.ts";
import { blocksById, overridesOf, viewOf } from "./editor-port.ts";
import { issuedOfflineMessage } from "./messages.ts";
import { deviceDay, latestIssue } from "./state-facts.ts";
import { createProductionViewState } from "./view-state.ts";
import type { ProductionAccess, ProductionViewState } from "./view-state.ts";

type Selection = NonNullable<
  ReturnType<typeof productionContextActions.get>
>["selection"];

/** What the services read of the document's open editor. */
export interface ProductionEditor {
  /** What the selection holds, as the command context names it; never "pages". */
  selection(): Selection;
  /** The labels of the pages the active revision marks, in page order. */
  revisedPages(): readonly string[];
}

/** A guarded setting's new value, as Change layout… names it ("paper size", "A4"). */
export interface LayoutChange {
  key: string;
  value: unknown;
  noun: string;
  valueLabel: string;
}

/** What production's interface has open on the document, one at a time. */
export type ProductionOpen =
  | { kind: "none" }
  | { kind: "lock" }
  | { kind: "unlock" }
  | { kind: "end" }
  /** A frozen row choosing its new value. */
  | { kind: "choose_layout"; key: SettingKey }
  | { kind: "change_layout"; change: LayoutChange }
  /** The first chosen row of the Pages tab, taking its new label. */
  | { kind: "renumber" };

export const NOTHING_OPEN: ProductionOpen = Object.freeze({ kind: "none" });

export interface ProductionServices {
  readonly docId: string;
  readonly userId: string;
  readonly client: ProductionClient;
  /** What the editor reads of production. */
  readonly port: ProductionPort;
  /** Where the editor publishes the Pages tab's rows, and what the tab reads of them. */
  readonly sink: PagesSink;
  readonly pages: ProductionPagesSelectors;
  /** The labels of the rows chosen in the Pages tab, in page order. */
  readonly chosenPages: Subscribable<readonly string[]> & {
    set(labels: readonly string[]): void;
  };
  /** Updated each time the editor publishes its pages. */
  readonly revisedPages: Subscribable<readonly string[]>;
  readonly view: ProductionViewState;
  readonly mode: Subscribable<MarkMode>;
  /** As the server last said to this device; false for both before it first has. */
  readonly access: Subscribable<ProductionAccess>;
  readonly open: Subscribable<ProductionOpen> & {
    set(value: ProductionOpen): void;
  };
  /** Everyone with a role on the script, asked of the server each time; null while it cannot say. */
  people(): Promise<DocPeopleResponse["people"] | null>;
  /** Follows `editor` until the returned detach. */
  attach(editor: ProductionEditor): () => void;
  dispose(): void;
}

const NO_ACCESS: ProductionAccess = Object.freeze({
  canLock: false,
  canIssue: false,
});
const NO_PAGES: readonly string[] = Object.freeze([]);
const NOTHING_TO_STOP = (): void => {};

// a browser that refuses storage keeps nothing between visits: the state is asked of the server each time
const NO_CACHE: ProductionCache = Object.freeze({
  read: async () => null,
  write: async () => {},
  clear: async () => {},
});

// the Pages store's writes are checked by the guard every interface store answers to
const PAGES_GUARD: Guard = Object.freeze({
  enter() {},
  leave() {},
  check: guardWrite,
  violations: () => 0,
});

const schedule = (fn: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(fn, delayMs);
  return () => clearTimeout(timer);
};

/** Nothing is written for a document whose production was never known. */
function forgetContext(docId: string): void {
  if (productionContextActions.get(docId) !== null)
    productionContextActions.set(docId, null);
}

/** The revision Recall would withdraw, and when its window closes; null before the first issue and after a correction. */
function recallable(
  held: CachedProduction,
): { name: string; closesAt: number } | null {
  const latest = latestIssue(held.state);
  if (latest === null) return null;
  return {
    name: latest.set.name,
    closesAt: latest.issue.issuedAt + RECALL_WINDOW_MS,
  };
}

type Post = (
  path: string,
  body: unknown,
) => Promise<{ status: number; body: unknown }>;

/** The person's capabilities on the script, asked of the server; null while it cannot say. */
async function askAccess(
  post: Post,
  docId: string,
): Promise<ProductionAccess | null> {
  const answer = await post("/api/docs/describe", { docId }).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  const body: unknown = answer.body;
  const list: unknown =
    typeof body === "object" && body !== null
      ? Reflect.get(body, "capabilities")
      : null;
  if (!Array.isArray(list)) return null;
  const has = (capability: Capability): boolean => list.includes(capability);
  return {
    canLock: has("lock_page_numbers"),
    canIssue: has("issue_revisions"),
  };
}

type ScriptPerson = DocPeopleResponse["people"][number];

const isScriptPerson = (value: unknown): value is ScriptPerson =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "userId") === "string" &&
  typeof Reflect.get(value, "name") === "string";

/** Everyone with a role on the script, asked of the server; null while it cannot say. */
async function askPeople(
  post: Post,
  docId: string,
): Promise<DocPeopleResponse["people"] | null> {
  const answer = await post("/api/docs/people", { docId }).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  const body: unknown = answer.body;
  const list: unknown =
    typeof body === "object" && body !== null
      ? Reflect.get(body, "people")
      : null;
  return Array.isArray(list) && list.every(isScriptPerson) ? list : null;
}

/** Says an issue made while this device was offline once, and tells the client when the person dismisses it. */
function tellIssuedOffline(
  client: ProductionClient,
  messages: MessageQueue,
): () => void {
  let stopShown = NOTHING_TO_STOP;
  const stop = client.issuedWhileOffline().subscribe((issue) => {
    if (issue === null) return;
    const message = issuedOfflineMessage(issue);
    let shown = false;
    stopShown();
    stopShown = messages.subscribe(() => {
      const current = messages.current()?.id === message.id;
      if (current) shown = true;
      else if (shown) {
        stopShown();
        client.dismiss();
      }
    });
    messages.push(message);
  });
  return () => {
    stop();
    stopShown();
  };
}

export function createProductionServices(options: {
  docId: string;
  handle: DocHandle;
  userId: string;
  now: () => number;
  messages: MessageQueue;
}): ProductionServices {
  const { docId, handle, userId, now } = options;
  const { indexedDb } = browserStores();
  const transport = createHttpProductionTransport({
    baseUrl: location.origin,
    // the tab's own person: production is asked as the person whose sync this is
    token: () => {
      const person = readPerson(tabStorage());
      return person?.userId === userId ? person.token : null;
    },
    fetch,
  });
  const client = createProductionClient({
    docId,
    handle,
    transport,
    cache:
      indexedDb === null
        ? NO_CACHE
        : createIdbProductionCache({ userId, indexedDb }),
    random: { bytes: (n) => crypto.getRandomValues(new Uint8Array(n)) },
    clock: { now, schedule },
  });
  const view = createProductionViewState({
    ...browserStorage(window),
    userId,
    docId,
  });
  const mode = createValue(view.mode());
  const tint = createValue(view.tint());
  const access = createValue(view.access() ?? NO_ACCESS);
  const chosenPages = createValue<readonly string[]>(NO_PAGES);
  const revisedPages = createValue<readonly string[]>(NO_PAGES);
  const open = createValue(NOTHING_OPEN);
  const store = createProductionPagesStore({
    guard: PAGES_GUARD,
    schedule,
    composing: () => false,
  });
  let editor: ProductionEditor | null = null;
  const sink: PagesSink = {
    publish(rows, revised) {
      store.sink.publish(rows, revised);
      revisedPages.set(editor?.revisedPages() ?? NO_PAGES);
    },
  };
  let shownView: ProductionView | null = null;
  const viewListeners = new Set<() => void>();
  const showView = (): void => {
    const day = deviceDay(now());
    const shown = { mode: mode.get(), tint: tint.get(), day };
    shownView = viewOf(client.current().get(), shown, () => blocksById(handle));
    for (const listener of viewListeners) listener();
  };
  let cancelRecallEnd = NOTHING_TO_STOP;
  const publishContext = (): void => {
    const held = client.current().get();
    cancelRecallEnd();
    if (held === null) {
      forgetContext(docId);
      return;
    }
    const recall = recallable(held);
    const recallOpen = recall !== null && now() <= recall.closesAt;
    if (recallOpen)
      cancelRecallEnd = schedule(publishContext, recall.closesAt - now() + 1);
    productionContextActions.set(docId, {
      locked: held.state.locked,
      ...access.get(),
      recallOpen,
      waiting: client.waiting().get(),
      activeName: held.state.sets.at(-1)?.name ?? "",
      recallName: recallOpen ? recall.name : null,
      // read as each command's state is worked out, so a caret move writes no store
      get selection(): Selection {
        return chosenPages.get().length > 0
          ? "pages"
          : (editor?.selection() ?? null);
      },
      mode: mode.get(),
      tint: tint.get(),
    });
  };
  // the waiting count changes inside the editor's transaction, when no interface store may be written
  let cancelWaiting = NOTHING_TO_STOP;
  const publishAfterTransaction = (): void => {
    cancelWaiting();
    cancelWaiting = schedule(publishContext, 0);
  };
  const followAccess = (): void =>
    void askAccess(transport.post, docId).then((known) => {
      if (known === null) return;
      view.setAccess(known);
      access.set(known);
    });
  const stops = [
    client.current().subscribe(showView),
    client.current().subscribe(publishContext),
    client.waiting().subscribe(publishAfterTransaction),
    access.subscribe(publishContext),
    chosenPages.subscribe(publishContext),
    view.subscribe(() => {
      mode.set(view.mode());
      tint.set(view.tint());
    }),
    mode.subscribe(showView),
    tint.subscribe(showView),
    mode.subscribe(publishContext),
    tint.subscribe(publishContext),
    // a reconnection may follow a change of the person's role
    handle.on((event) => {
      if (event.type === "subscribed") followAccess();
    }),
    tellIssuedOffline(client, options.messages),
    watchImportLock({
      client,
      doc: handle.doc(),
      today: () => deviceDay(now()),
      timers: {
        every(ms, run) {
          const timer = setInterval(run, ms);
          return () => clearInterval(timer);
        },
      },
    }),
  ];
  followAccess();
  showView();
  publishContext();
  return {
    docId,
    userId,
    client,
    port: {
      view: () => shownView,
      subscribe(listener) {
        viewListeners.add(listener);
        return () => viewListeners.delete(listener);
      },
      overrides: overridesOf(handle),
    },
    sink,
    pages: store.selectors,
    chosenPages,
    revisedPages,
    view,
    mode,
    access,
    open,
    people: () => askPeople(transport.post, docId),
    attach(attached) {
      editor = attached;
      return () => {
        if (editor === attached) editor = null;
      };
    },
    dispose() {
      for (const stop of stops) stop();
      cancelRecallEnd();
      cancelWaiting();
      viewListeners.clear();
      client.dispose();
      view.dispose();
      forgetContext(docId);
    },
  };
}
