// The page's side of the shell channel: the person's commands, which the native menus run and are drawn from, and the
// window's answers to the shell, whoever it draws.
import { COMMANDS, menuModel } from "@manent/commands";
import type { CommandService } from "@manent/commands";
import type { Clock } from "@manent/sync-client";
import { NATIVE_MENU_IDS } from "@manent/sync-protocol";
import { EDITOR_WORDS, LIBRARY_WORDS } from "@manent/ui";
import type { Message, MessageQueue, Subscribable } from "@manent/ui";
import { sendPath } from "../screens/send/form-ids.ts";
import type { Environment, PersonServices } from "../services/ports.ts";
import type { CloseGuard } from "../services/sync/close-guard.ts";
import { setActiveDesktopHost } from "./active-host.ts";
import { installDesktopClose } from "./desktop-close.ts";
import { watchRefusedFiles } from "./file-messages.ts";
import type { DesktopHost } from "./host.ts";
import { NATIVE_MENU_PLATFORMS, createMenuSender } from "./native-menu.ts";

const noop = (): void => {};

/**
 * Each menu command the shell sends runs through `service` as a native menu run; where the system draws native menus,
 * they are sent again whenever `service` notifies. The returned function ends both.
 */
export function connectShellCommands(options: {
  host: DesktopHost;
  service: CommandService;
  clock: Clock;
}): () => void {
  const { host, service, clock } = options;
  const stopHearing = host.onMessage((message) => {
    if (message.t === "menu_command") service.run(message.id, "native_menu");
  });
  if (!NATIVE_MENU_PLATFORMS.includes(host.platform)) return stopHearing;
  const sender = createMenuSender({
    host,
    models: () =>
      NATIVE_MENU_IDS.map((menu) => menuModel(menu, COMMANDS, service)),
    clock,
  });
  const stopFollowing = service.subscribe(sender.changed);
  sender.changed();
  return () => {
    stopHearing();
    stopFollowing();
    sender.stop();
  };
}

/** The close guard of whoever the window draws: with nobody, nothing is at risk. */
function shownGuard(shown: Subscribable<PersonServices | null>): CloseGuard {
  return {
    failing: () => shown.get()?.closing.guard.failing() ?? null,
    // asked only once `failing` has named a document, so only of a person
    ask: () => shown.get()?.closing.guard.ask() ?? Promise.resolve("stay"),
  };
}

/** The messages of whoever the window draws; one pushed while it draws nobody waits for the next person. */
function shownMessages(shown: Subscribable<PersonServices | null>): {
  queue: MessageQueue;
  stop(): void;
} {
  const waiting: Message[] = [];
  const stop = shown.subscribe((services) => {
    if (services === null) return;
    for (const message of waiting.splice(0)) services.messages.push(message);
  });
  const queue = (): MessageQueue | null => shown.get()?.messages ?? null;
  return {
    queue: {
      push(message) {
        const messages = queue();
        if (messages === null) waiting.push(message);
        else messages.push(message);
      },
      current: () => queue()?.current() ?? null,
      dismiss: (id) => queue()?.dismiss(id),
      withdraw: (id) => queue()?.withdraw(id),
      withdrawUndo: () => queue()?.withdrawUndo(),
      receipts: () => queue()?.receipts() ?? [],
      subscribe(listener) {
        let stopHearing = queue()?.subscribe(listener) ?? noop;
        const stopFollowing = shown.subscribe((services) => {
          stopHearing();
          stopHearing = services?.messages.subscribe(listener) ?? noop;
        });
        return () => {
          stopFollowing();
          stopHearing();
        };
      },
    },
    stop,
  };
}

/**
 * The window's answers to the shell while it is open, through the person it draws at the time (`personServices`): the
 * close, at once while it draws nobody; the files the shell refused to open; and each `update_state`, kept in
 * `updateState`. `pathname` is the page's path. The returned function ends all three.
 */
export function answerShell(options: {
  host: DesktopHost;
  environment: Environment;
  pathname: () => string;
}): () => void {
  const { host, environment } = options;
  setActiveDesktopHost(host);
  const shown = environment.personServices;
  const messages = shownMessages(shown);
  // the open script is the one Export writes
  const docId = (): string => environment.shellState.get().docId ?? "";
  const stops = [
    installDesktopClose({
      host,
      guard: shownGuard(shown),
      queue: messages.queue,
      exportedText: () =>
        EDITOR_WORDS.send.exported(
          shown.get()?.library.documentTitle(docId()).get() ??
            LIBRARY_WORDS.untitledScript,
        ),
      // the shell writes its state after every move between screens
      routeChanges: (listener) =>
        environment.shellState.subscribe(() => listener(options.pathname())),
      exportPath: () => sendPath(docId(), "export"),
    }),
    watchRefusedFiles({ host, queue: messages.queue }),
    messages.stop,
    host.onMessage((message) => {
      if (message.t === "update_state")
        environment.updateState.set(message.state);
    }),
  ];
  return () => {
    setActiveDesktopHost(null);
    for (const stop of stops) stop();
  };
}
