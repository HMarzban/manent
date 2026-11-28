// One person's command service: the context a command sees, the handlers it runs and what makes it look again.
import { COMMANDS, createCommandService } from "@manent/commands";
import type {
  CommandService,
  Resolved,
  RunSource,
  SettingWriter,
} from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import type { SettingsStore } from "@manent/settings";
import type { Clock } from "@manent/sync-client";
import { messageFor } from "@manent/ui";
import type { MessageQueue, StatusFacts, Subscribable } from "@manent/ui";
import type { Api } from "../api.ts";
import { dedupedService } from "../desktop/deduped-service.ts";
import type { DesktopHost } from "../desktop/host.ts";
import { createNodeCloud } from "../desktop/node-cloud.ts";
import type { NodeCloud } from "../desktop/node-cloud.ts";
import type { EditorControl } from "../editor-host/control.ts";
import { zoomAnnouncement } from "../editor-host/zoom.ts";
import { createHandlers } from "../handlers/index.ts";
import type { Navigation } from "../handlers/index.ts";
import { subscribeDriver } from "../room/driver.ts";
import { focusModeActions } from "../state/focus-mode.store.ts";
import { formattingBarActions } from "../state/formatting-bar.store.ts";
import { layoutViewActions } from "../state/layout-view.store.ts";
import { materialActions } from "../state/material.store.ts";
import { outlineStartActions } from "../state/outline-start.store.ts";
import type { PersonStore } from "../state/person.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { prompterActions } from "../state/prompter.store.ts";
import { readAloudActions } from "../state/read-aloud.store.ts";
import { rulerActions } from "../state/ruler.store.ts";
import { rundownActions } from "../state/rundown.store.ts";
import { sprintActions } from "../state/sprint.store.ts";
import { trashActions } from "../state/trash.store.ts";
import { workspaceActions } from "../state/workspace.store.ts";
import { writingActions } from "../state/writing.store.ts";
import { zoomActions } from "../state/zoom.store.ts";
import { buildCommandContext } from "./command-context.ts";
import type { Access } from "./command-context.ts";
import type {
  DocumentSource,
  Environment,
  LibraryIndex,
  PersonServices,
  ShellState,
} from "./ports.ts";

export type CommandsOptions = Environment & {
  demo: Subscribable<boolean>;
  api: Api;
  usePerson: PersonStore;
  router: Navigation;
};

interface CommandsParts {
  settings: SettingsStore;
  openScriptStore(docId: string): SettingsStore;
  messages: MessageQueue;
  resolved: Subscribable<Resolved>;
  /** The open editor, whose drawn zoom a command may know. */
  control: Pick<EditorControl, "zoomPercent">;
  /** The person's sync can reach the network: the browser is online and the tab's Connection is not Offline. */
  network: Subscribable<boolean>;
  /** The kinds of the open document and of its project. */
  library: Pick<LibraryIndex, "documentKind" | "docKindOf">;
  /** The open document's status, whose access sets the person's role in it. */
  documents: DocumentSource;
  onCommandRan?: (id: string, source: RunSource) => void;
}

// a zoom chosen in a menu shows there as checked; one chosen by a key or in the palette is said
const isSaidZoom = (id: string, from: RunSource): boolean =>
  id.startsWith("view.zoom") && (from === "key" || from === "palette");

const noop = (): void => {};

/**
 * Follows what `pick` gives for the document the shell shows, from document to document: `follow` is called for each
 * new value, and what it returned stops it when another comes; nothing is followed off a document.
 */
function followShown<T>(
  shellState: Subscribable<ShellState>,
  pick: (docId: string) => T,
  follow: (picked: T) => () => void,
): () => void {
  let followed: T | null = null;
  let stop = noop;
  const update = (): void => {
    const { docId } = shellState.get();
    const picked = docId === null ? null : pick(docId);
    if (picked === followed) return;
    stop();
    followed = picked;
    stop = picked === null ? noop : follow(picked);
  };
  update();
  const unsubscribe = shellState.subscribe(update);
  return () => {
    unsubscribe();
    stop();
  };
}

/** Calls `notify` whenever the open script's format, kinds, or room driver change. */
function followDocument(
  options: CommandsOptions,
  parts: CommandsParts,
  notify: () => void,
): () => void {
  const { shellState, usePerson } = options;
  const stopFormat = followShown(shellState, parts.openScriptStore, (store) =>
    store.subscribe("script.format", notify),
  );
  const stopKinds = followShown(
    shellState,
    (docId) => docId,
    (docId) => {
      const stopDocKind = parts.library.docKindOf(docId).subscribe(notify);
      const stopProjectKind = parts.library
        .documentKind(docId)
        .subscribe(notify);
      const userId = usePerson.getState().person?.userId ?? null;
      const stopDriver =
        userId === null ? noop : subscribeDriver(userId, docId, notify);
      return () => {
        stopDocKind();
        stopProjectKind();
        stopDriver();
      };
    },
  );
  return () => {
    stopFormat();
    stopKinds();
  };
}

/**
 * Holds the document the shell shows open and calls `notify` when its access changes; `accessOf` is an editor's for any
 * other document, as the status of a document still opening is.
 */
function followAccess(
  shellState: Subscribable<ShellState>,
  documents: DocumentSource,
  notify: () => void,
): { accessOf(docId: string): Access; stop(): void } {
  let shown: { docId: string; status: Subscribable<StatusFacts> } | null = null;
  const stop = followShown(
    shellState,
    (docId) => docId,
    (docId) => {
      const { status } = documents.open(docId);
      shown = { docId, status };
      let access = status.get().access;
      const stopStatus = status.subscribe((facts) => {
        if (facts.access === access) return;
        access = facts.access;
        notify();
      });
      // the context read as the shell moved here was read before the document was held
      notify();
      return () => {
        stopStatus();
        shown = null;
        documents.close(docId);
      };
    },
  );
  return {
    accessOf: (docId) =>
      shown?.docId === docId ? shown.status.get().access : "edit",
    stop,
  };
}

const tokenOf = (options: CommandsOptions): string | null =>
  options.usePerson.getState().person?.token ?? null;

/** On the web the person is signed in to sync once the tab holds a token; in the desktop app that token is the node's, so the node says. */
const isSignedIn = (
  options: CommandsOptions,
  nodeCloud: NodeCloud | null,
): boolean =>
  nodeCloud === null ? tokenOf(options) !== null : nodeCloud.signedIn.get();

/** `service`, telling the environment of every command that ran, and saying a zoom chosen by a key or in the palette. */
function reportingRuns(
  service: CommandService,
  options: CommandsOptions,
  onCommandRan?: (id: string, source: RunSource) => void,
): CommandService {
  return {
    run(id, from) {
      const result = service.run(id, from);
      if (result !== "ran") return result;
      options.ran(id);
      onCommandRan?.(id, from);
      if (isSaidZoom(id, from))
        options.dom.announce(zoomAnnouncement(zoomActions.get()));
      return result;
    },
    state: service.state,
    subscribe: service.subscribe,
  };
}

/** `commands` in the desktop app: a key press the native menu also heard runs once, and the shell's menus run them. */
function reachedFromShell(
  commands: CommandService,
  host: DesktopHost,
  clock: Clock,
): { commands: CommandService; stop(): void } {
  const reached = dedupedService(commands, clock.now);
  let stopped = false;
  let stopShell = noop;
  // the shell's menus, with what only they need, stay out of the entry
  void import("../desktop/shell-channel.ts").then((shell) => {
    if (stopped) return;
    stopShell = shell.connectShellCommands({ host, service: reached, clock });
  });
  return {
    commands: reached,
    stop() {
      stopped = true;
      stopShell();
    },
  };
}

/**
 * The command service over `COMMANDS` and the handlers `fillHandlers` makes, told of every change to the window's state, the
 * person, the bindings, the settings, the open script's format and production, the Ruler, the zoom, the kinds of the open
 * document and its project, the person's access to it, and every store a command's context reads; a setting command
 * writes the open document's store, so a script setting reaches its script, and a zoom chosen by a key or in the palette is
 * said. In the desktop app the shell's native menus reach it too, and the person is signed in to sync when the node says so.
 */
export function createCommands(
  options: CommandsOptions,
  parts: CommandsParts,
): {
  commands: CommandService;
  fillHandlers(services: PersonServices): void;
  stop(): void;
} {
  const { settings, messages, resolved } = parts;
  // filled once the services exist, before anything can run a command
  const handlers: Record<string, () => void> = {};
  const { desktop } = options;
  const nodeCloud =
    desktop === null
      ? null
      : createNodeCloud({ fetch, token: () => tokenOf(options) });
  const settingsHere = (): SettingWriter => {
    const { docId } = options.shellState.get();
    return docId === null ? settings : parts.openScriptStore(docId);
  };
  const service = createCommandService({
    commands: COMMANDS,
    handlers,
    context: () =>
      buildCommandContext(
        options,
        parts,
        isSignedIn(options, nodeCloud),
        // read only once the service is made, after which access is set
        (docId) => access.accessOf(docId),
      ),
    settings: {
      get: (key) => settingsHere().get(key),
      set: (key, value) => settingsHere().set(key, value),
    },
    bindings: () => resolved.get().effective,
    onDisabled: (label, reason) =>
      messages.push(messageFor({ kind: "command_unavailable", label, reason })),
  });
  const access = followAccess(
    options.shellState,
    parts.documents,
    service.notify,
  );
  const unsubscribers = [
    options.shellState.subscribe(service.notify),
    options.usePerson.subscribe(service.notify),
    options.demo.subscribe(service.notify),
    resolved.subscribe(service.notify),
    parts.network.subscribe(service.notify),
    ...SETTINGS.all.map((def) => settings.subscribe(def.key, service.notify)),
    rulerActions.subscribe(service.notify),
    formattingBarActions.subscribe(service.notify),
    layoutViewActions.subscribe(service.notify),
    productionContextActions.subscribe(service.notify),
    zoomActions.subscribe(service.notify),
    outlineStartActions.subscribe(service.notify),
    writingActions.subscribe(service.notify),
    materialActions.subscribe(service.notify),
    rundownActions.subscribe(service.notify),
    prompterActions.subscribe(service.notify),
    trashActions.subscribe(service.notify),
    workspaceActions.subscribe(service.notify),
    focusModeActions.subscribe(service.notify),
    readAloudActions.subscribe(service.notify),
    sprintActions.subscribe(service.notify),
    followDocument(options, parts, service.notify),
    access.stop,
  ];
  if (nodeCloud !== null)
    unsubscribers.push(nodeCloud.signedIn.subscribe(service.notify));
  const commands = reportingRuns(service, options, parts.onCommandRan);
  // the environment's now and schedule are the clock
  const shell =
    desktop === null ? null : reachedFromShell(commands, desktop, options);
  if (shell !== null) unsubscribers.push(shell.stop);
  return {
    commands: shell?.commands ?? commands,
    fillHandlers(services) {
      const shellState = options.shellState.get;
      Object.assign(
        handlers,
        createHandlers({ ...options, services, shellState, nodeCloud }),
      );
    },
    stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
    },
  };
}
