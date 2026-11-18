// The one place a command runs, and where its state is read, whatever started it.
import type { Keys } from "./chord.ts";
import type { CommandContext } from "./context.ts";
import { defineCommands, labelOf } from "./define.ts";
import type { CommandDefinition, SettingWriter } from "./define.ts";

export type RunSource =
  "key" | "menu" | "native_menu" | "control" | "palette" | "tour";
/** `passed`: the caller lets the dialog, the field or the browser have the key. */
export type RunResult = "ran" | "disabled" | "absent" | "passed";

export interface CommandState {
  enabled: boolean;
  visible: boolean;
  checked: boolean | null;
  /** Evaluated for the current context. */
  label: string;
  keys: Keys;
  /** The reason clause while disabled, else null. */
  whyNot: string | null;
}

export interface CommandService {
  run(id: string, source: RunSource): RunResult;
  /** Read afresh from the context, the settings and the bindings. Throws RangeError for an id it does not hold. */
  state(id: string): CommandState;
  /** The listener is called whenever the app says the context or the bindings changed. */
  subscribe(listener: () => void): () => void;
}

const NO_KEYS: Keys = Object.freeze([]);

/** The reason the command cannot run in this context, or null when it can. */
function whyNotHere(
  def: CommandDefinition,
  ctx: CommandContext,
): string | null {
  if (def.when === null || def.when(ctx)) return null;
  // defineCommands refused every when without a whyNot before the service held it
  return def.whyNot!(ctx);
}

/**
 * The service over `commands`; throws CommandsError for a list defineCommands refuses. `notify` is the app's: it calls it when
 * the context or the bindings change, never per keystroke. A disabled run calls `onDisabled` with the evaluated label and the reason clause.
 */
export function createCommandService(options: {
  commands: readonly CommandDefinition[];
  handlers: Readonly<Record<string, () => void>>;
  context: () => CommandContext;
  settings: SettingWriter;
  bindings: () => ReadonlyMap<string, Keys>;
  onDisabled: (label: string, reason: string) => void;
}): CommandService & { notify(): void } {
  const { handlers, context, settings, bindings, onDisabled } = options;
  const byId: ReadonlyMap<string, CommandDefinition> = new Map(
    defineCommands(options.commands).map((def) => [def.id, def]),
  );
  const listeners = new Set<() => void>();

  const perform = (def: CommandDefinition): void => {
    if (def.setting !== null) {
      const { key, value } = def.setting;
      settings.set(key, value === null ? settings.get(key) !== true : value);
      return;
    }
    const handler = handlers[def.id];
    if (handler === undefined)
      throw new RangeError(`no handler is registered for ${def.id}`);
    handler();
  };

  return {
    run(id: string): RunResult {
      const def = byId.get(id);
      const ctx = context();
      if (def === undefined || (def.visible !== null && !def.visible(ctx)))
        return "absent";
      if (
        ctx.focus === "dialog" ||
        (def.passThrough !== null && def.passThrough(ctx))
      )
        return "passed";
      const reason = whyNotHere(def, ctx);
      if (reason !== null) {
        onDisabled(labelOf(def, ctx), reason);
        return "disabled";
      }
      perform(def);
      return "ran";
    },
    state(id: string): CommandState {
      const def = byId.get(id);
      if (def === undefined)
        throw new RangeError(`no command is registered as ${id}`);
      const ctx = context();
      const whyNot = whyNotHere(def, ctx);
      return {
        enabled: whyNot === null,
        visible: def.visible === null || def.visible(ctx),
        checked: def.checked === null ? null : def.checked(ctx, settings),
        label: labelOf(def, ctx),
        keys: bindings().get(id) ?? NO_KEYS,
        whyNot,
      };
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify(): void {
      for (const listener of listeners) listener();
    },
  };
}
