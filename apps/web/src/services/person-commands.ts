// One person's command service: the context a command sees, the handlers it runs and what makes it look again.
import { COMMANDS, createCommandService } from "@manent/commands";
import type {
  CommandContext,
  CommandService,
  Resolved,
  RunSource,
  SettingWriter,
} from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import type { SettingsStore } from "@manent/settings";
import type { Clock } from "@manent/sync-client";
import { messageFor } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import type { Api } from "../api.ts";
import { dedupedService } from "../desktop/deduped-service.ts";
import type { DesktopHost } from "../desktop/host.ts";
import { createNodeCloud } from "../desktop/node-cloud.ts";
import type { NodeCloud } from "../desktop/node-cloud.ts";
import type { EditorControl } from "../editor-host/control.ts";
import { zoomAnnouncement } from "../editor-host/zoom.ts";
import { createHandlers } from "../handlers/index.ts";
import type { Navigation } from "../handlers/index.ts";
import type { PersonStore } from "../state/person.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { rulerActions } from "../state/ruler.store.ts";
import { zoomActions } from "../state/zoom.store.ts";
import type { Environment, PersonServices, ShellState } from "./ports.ts";

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
}

/** What a command may know: the window's state from the shell, the focus and connection read now, and the person's. */
function commandContext(
  options: CommandsOptions,
  parts: CommandsParts,
  signedIn: boolean,
): CommandContext {
  const { docId, screen, panels, historyPresent, spaceBeforeSet } =
    options.shellState.get();
  return {
    screen,
    focus: options.dom.focusKind(),
    docOpen: docId !== null,
    // every person edits every document until sync supplies roles
    role: docId === null ? null : "editor",
    online: parts.network.get(),
    platform: options.where.platform,
    shell: options.where.shell,
    demo: options.demo.get(),
    signedIn,
    panelOpen: { left: panels.left !== null, side: panels.side !== null },
    historyPresent,
    format:
      docId === null ? null : parts.openScriptStore(docId).get("script.format"),
    rulerShown: rulerActions.get(),
    spaceBeforeSet,
    zoom: docId === null ? null : zoomActions.get(),
    zoomPercent: docId === null ? null : parts.control.zoomPercent(),
    production: docId === null ? null : productionContextActions.get(docId),
  };
}

// a zoom chosen in a menu shows there as checked; one chosen by a key or in the palette is said
const isSaidZoom = (id: string, from: RunSource): boolean =>
  id.startsWith("view.zoom") && (from === "key" || from === "palette");

const noop = (): void => {};

/** Calls `notify` whenever the format of the script the shell shows changes, following the shell from script to script. */
function followFormat(
  shellState: Subscribable<ShellState>,
  openScriptStore: (docId: string) => SettingsStore,
  notify: () => void,
): () => void {
  let followed: SettingsStore | null = null;
  let stop = noop;
  const follow = (): void => {
    const { docId } = shellState.get();
    const store = docId === null ? null : openScriptStore(docId);
    if (store === followed) return;
    stop();
    followed = store;
    stop = store === null ? noop : store.subscribe("script.format", notify);
  };
  follow();
  const unsubscribe = shellState.subscribe(follow);
  return () => {
    unsubscribe();
    stop();
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
): CommandService {
  return {
    run(id, from) {
      const result = service.run(id, from);
      if (result !== "ran") return result;
      options.ran(id);
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
 * person, the bindings, the settings, the open script's format, the Ruler and the zoom; a setting command writes the open
 * document's store, so a script setting reaches its script, and a zoom chosen by a key or in the palette is said. In the
 * desktop app the shell's native menus reach it too, and the person is signed in to sync when the node says so.
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
      commandContext(options, parts, isSignedIn(options, nodeCloud)),
    settings: {
      get: (key) => settingsHere().get(key),
      set: (key, value) => settingsHere().set(key, value),
    },
    bindings: () => resolved.get().effective,
    onDisabled: (label, reason) =>
      messages.push(messageFor({ kind: "command_unavailable", label, reason })),
  });
  const unsubscribers = [
    options.shellState.subscribe(service.notify),
    options.usePerson.subscribe(service.notify),
    options.demo.subscribe(service.notify),
    resolved.subscribe(service.notify),
    parts.network.subscribe(service.notify),
    ...SETTINGS.all.map((def) => settings.subscribe(def.key, service.notify)),
    rulerActions.subscribe(service.notify),
    zoomActions.subscribe(service.notify),
    followFormat(options.shellState, parts.openScriptStore, service.notify),
  ];
  if (nodeCloud !== null)
    unsubscribers.push(nodeCloud.signedIn.subscribe(service.notify));
  const commands = reportingRuns(service, options);
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
