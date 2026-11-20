// One person's editor: the page's mount over that person's commands, keys and messages, loaded apart from the entry.
import type { CommandService, Resolved } from "@manent/commands";
import { randomBlockId } from "@manent/schema";
import { createKeyResolver } from "@manent/ui";
import type { MessageQueue, StatusFacts, Subscribable } from "@manent/ui";
import {
  EDITOR_FIXED_KEYS,
  browserPagePorts,
  createEditorMount,
} from "../editor-host/editor-mount.ts";
import type { OpenEditor } from "../editor-host/editor-mount.ts";
import { createLocalSessions } from "../editor-host/editor-sessions.ts";
import type { EditorMount } from "../editor-host/mount.ts";
import { createEditorKeyRun } from "../handlers/editor.ts";
import type { EditorParts, Environment } from "./ports.ts";

/** The editor's keys: a chord is looked up in the person's editor table and runs its command. */
function editorKeys(
  commands: CommandService,
  messages: MessageQueue,
  resolved: Subscribable<Resolved>,
) {
  return {
    resolve: createKeyResolver({ table: () => resolved.get().editorTable }),
    run: createEditorKeyRun({
      commands,
      messages,
      labelOf: (id) => commands.state(id).label,
    }),
  };
}

/**
 * The page's editor; `fixedKeys` gets the editor's keys once it has loaded. In the test build the editor's hooks are
 * installed on the page's `__manent`.
 */
export async function loadEditor(
  environment: Environment,
  parts: EditorParts,
): Promise<EditorMount> {
  const timers = { now: environment.now, schedule: environment.schedule };
  const frames = { request: environment.frame };
  const hooks =
    environment.flavour === "test"
      ? await import("../editor-host/test-hooks.ts")
      : null;
  parts.fixedKeys.set(EDITOR_FIXED_KEYS);
  const sessions = createLocalSessions({
    frames,
    clock: timers,
    ids: randomBlockId,
  });
  const access = new Map<string, StatusFacts["access"]>();
  let current: OpenEditor | null = null;
  const target: unknown = Reflect.get(globalThis, "__manent");
  if (hooks !== null && typeof target === "object" && target !== null)
    hooks.installEditorHooks(target, {
      services: parts.services(),
      navigate: parts.navigate,
      current: () => current,
      sessions,
      access,
    });
  return createEditorMount({
    sessions,
    services:
      hooks === null
        ? parts.services
        : () => hooks.withRecordedAccess(parts.services(), access),
    control: parts.control,
    keys: editorKeys(parts.commands, parts.messages, parts.resolved),
    ports: browserPagePorts(environment.userAgent),
    frames,
    timers,
    platform: environment.where.platform,
    ids: randomBlockId,
    random: environment.randomId,
    observe:
      hooks === null
        ? undefined
        : (open) => {
            current = open;
          },
  });
}
