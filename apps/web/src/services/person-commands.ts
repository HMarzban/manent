// One person's command service: the context a command sees, the handlers it runs and what makes it look again.
import { COMMANDS, createCommandService } from "@manent/commands";
import type {
  CommandContext,
  CommandService,
  Resolved,
  SettingWriter,
} from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import type { SettingsStore } from "@manent/settings";
import { messageFor } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import type { Api } from "../api.ts";
import { createHandlers } from "../handlers/index.ts";
import type { Navigation } from "../handlers/index.ts";
import type { PersonStore } from "../state/person.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { rulerActions } from "../state/ruler.store.ts";
import type { Environment, PersonServices, ShellState } from "./ports.ts";

export type CommandsOptions = Environment & {
  demo: Subscribable<boolean>;
  api: Api;
  usePerson: PersonStore;
  router: Navigation;
};

/** What a command may know: the window's state from the shell, the focus and connection read now, and the person's. */
function commandContext(
  options: CommandsOptions,
  openScriptStore: (docId: string) => SettingsStore,
): CommandContext {
  const { docId, screen, panels, historyPresent, spaceBeforeSet } =
    options.shellState.get();
  return {
    screen,
    focus: options.dom.focusKind(),
    docOpen: docId !== null,
    // every person edits every document until sync supplies roles
    role: docId === null ? null : "editor",
    online: options.online(),
    platform: options.where.platform,
    shell: options.where.shell,
    demo: options.demo.get(),
    signedIn: (options.usePerson.getState().person?.token ?? null) !== null,
    panelOpen: { left: panels.left !== null, side: panels.side !== null },
    historyPresent,
    format: docId === null ? null : openScriptStore(docId).get("script.format"),
    rulerShown: rulerActions.get(),
    spaceBeforeSet,
    production: docId === null ? null : productionContextActions.get(docId),
  };
}

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

/**
 * The command service over `COMMANDS` and the handlers `fillHandlers` makes, told of every change to the window's state, the
 * person, the bindings, the settings, the open script's format and the Ruler; a setting command writes the open document's store,
 * so a script setting reaches its script.
 */
export function createCommands(
  options: CommandsOptions,
  parts: {
    settings: SettingsStore;
    openScriptStore(docId: string): SettingsStore;
    messages: MessageQueue;
    resolved: Subscribable<Resolved>;
  },
): {
  commands: CommandService;
  fillHandlers(services: PersonServices): void;
  stop(): void;
} {
  const { settings, messages, resolved } = parts;
  // filled once the services exist, before anything can run a command
  const handlers: Record<string, () => void> = {};
  const settingsHere = (): SettingWriter => {
    const { docId } = options.shellState.get();
    return docId === null ? settings : parts.openScriptStore(docId);
  };
  const service = createCommandService({
    commands: COMMANDS,
    handlers,
    context: () => commandContext(options, parts.openScriptStore),
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
    ...SETTINGS.all.map((def) => settings.subscribe(def.key, service.notify)),
    rulerActions.subscribe(service.notify),
    followFormat(options.shellState, parts.openScriptStore, service.notify),
  ];
  return {
    commands: {
      run(id, from) {
        const result = service.run(id, from);
        if (result === "ran") options.ran(id);
        return result;
      },
      state: service.state,
      subscribe: service.subscribe,
    },
    fillHandlers(services) {
      const shellState = options.shellState.get;
      Object.assign(
        handlers,
        createHandlers({ ...options, services, shellState }),
      );
    },
    stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
    },
  };
}
