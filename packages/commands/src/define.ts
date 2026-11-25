// Declaring commands once, refused when a definition is malformed.
import type { MenuId } from "@manent/settings";
import { isChord } from "./chord.ts";
import type { PlatformKeys } from "./chord.ts";
import type { CommandContext } from "./context.ts";
import type { SurfaceId } from "./ids.ts";

/** Where a command's key is heard: everywhere, in the page, or on one surface. */
export type CommandScope = "global" | "editor" | `surface:${SurfaceId}`;

/** A command's place in a menu. With a submenu, the item is drawn under that label and its own label drops the leading "{submenu}: ". */
export interface MenuPlacement {
  menu: MenuId;
  group: string;
  order: number;
  submenu: string | null;
}

export interface SettingReader {
  get(key: string): unknown;
}

export interface SettingWriter extends SettingReader {
  set(key: string, value: unknown): { ok: boolean };
}

export interface CommandDefinition<Id extends string = string> {
  readonly id: Id;
  /** A function when the label carries its object ("Issue Pink…") or a setting's value, so that every place shows one label. */
  readonly label:
    string | ((ctx: CommandContext, read: SettingReader) => string);
  readonly group: MenuId;
  /** Where the command lives, shown in the palette; null when it has no home. */
  readonly home: string | null;
  readonly scope: CommandScope;
  readonly keys: PlatformKeys;
  readonly keysFixed: boolean;
  readonly when: ((ctx: CommandContext) => boolean) | null;
  /** The reason clause shown when `when` is false ("needs a document open"), never a sentence. */
  readonly whyNot: ((ctx: CommandContext) => string) | null;
  readonly visible: ((ctx: CommandContext) => boolean) | null;
  readonly checked:
    ((ctx: CommandContext, read: SettingReader) => boolean) | null;
  /** True when the key belongs to the field or the page here, and the command leaves it alone. */
  readonly passThrough: ((ctx: CommandContext) => boolean) | null;
  readonly menus: readonly MenuPlacement[];
  /** `hidden` holds the reason the command is left out of the palette. */
  readonly palette: { keywords: readonly string[] } | { hidden: string };
  readonly opens: {
    surface: SurfaceId;
    focus: "heading" | "first" | "item" | "stay";
  } | null;
  readonly reach: "self" | "others";
  /** For a generated setting command only: the value it sets; null turns a switch over. */
  readonly setting: { key: string; value: unknown } | null;
}

type CommandsErrorCode =
  "duplicate_id" | "bad_chord" | "missing_why_not" | "bad_id";

const ID_PATTERN = /^[a-z][a-zA-Z]*(\.[a-zA-Z0-9_]+)+$/;

const MESSAGES: Readonly<Record<CommandsErrorCode, string>> = Object.freeze({
  duplicate_id: "a command id is declared once",
  bad_chord: "every key must be a chord in the hotkey string form",
  missing_why_not: "a command with a when needs a whyNot",
  bad_id: `a command id must match ${ID_PATTERN.source}`,
});

/** A definition defineCommands refuses, with its id. */
export class CommandsError extends Error {
  readonly code: CommandsErrorCode;
  readonly id: string;

  constructor(code: CommandsErrorCode, id: string) {
    super(`${id}: ${MESSAGES[code]}`);
    this.name = "CommandsError";
    this.code = code;
    this.id = id;
  }
}

function refusalOf(
  def: CommandDefinition,
  seen: ReadonlySet<string>,
): CommandsErrorCode | null {
  if (!ID_PATTERN.test(def.id)) return "bad_id";
  if (seen.has(def.id)) return "duplicate_id";
  if (!Object.values(def.keys).every((keys) => keys.every(isChord)))
    return "bad_chord";
  if (def.when !== null && def.whyNot === null) return "missing_why_not";
  return null;
}

/** The definitions, unchanged. Throws CommandsError for the first one it refuses. */
export function defineCommands<const D extends readonly CommandDefinition[]>(
  definitions: D,
): D {
  const seen = new Set<string>();
  for (const def of definitions) {
    const code = refusalOf(def, seen);
    if (code !== null) throw new CommandsError(code, def.id);
    seen.add(def.id);
  }
  return definitions;
}

/** The label as shown in this context, with these settings. */
export function labelOf(
  def: CommandDefinition,
  ctx: CommandContext,
  read: SettingReader,
): string {
  return typeof def.label === "function" ? def.label(ctx, read) : def.label;
}
