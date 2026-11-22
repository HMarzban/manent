// The commands of production revisions: locking, the Pages tab, marking, omitting, issuing and recalling.
import type { Chord, PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition, MenuPlacement } from "../define.ts";

type Production = NonNullable<CommandContext["production"]>;
type Selection = Production["selection"];

/** What a command needs before it can run, with the reason clause said while it is missing. */
interface Need {
  holds(ctx: CommandContext): boolean;
  reason(ctx: CommandContext): string;
}

const ONLINE: Need = {
  holds: (ctx) => ctx.online,
  reason: () => "needs a connection",
};

const waitingOf = (ctx: CommandContext): number => ctx.production?.waiting ?? 0;

/** The reason clause while `n` changes made on this device wait to sync, with thousands separators: "needs this device's 1,200 waiting changes synced first". */
export const waitingReason = (n: number): string =>
  `needs this device's ${n === 1 ? "1 waiting change" : `${n.toLocaleString("en-GB")} waiting changes`} synced first`;

const SYNCED: Need = {
  holds: (ctx) => waitingOf(ctx) === 0,
  reason: (ctx) => waitingReason(waitingOf(ctx)),
};

const selecting = (kinds: readonly Selection[], reason: string): Need => ({
  holds: (ctx) => kinds.includes(ctx.production?.selection ?? null),
  reason: () => reason,
});

/** Needs `first`, then `then`; the reason is that of the first one missing. */
const both = (first: Need, then: Need): Need => ({
  holds: (ctx) => first.holds(ctx) && then.holds(ctx),
  reason: (ctx) => (first.holds(ctx) ? then.reason(ctx) : first.reason(ctx)),
});

const ONLINE_AND_SYNCED = both(ONLINE, SYNCED);
const TEXT_SELECTED = selecting(["text", "scene"], "needs a selection");
const ONLINE_WITH_PAGES = both(
  ONLINE,
  selecting(["pages"], "needs pages selected in the Pages tab"),
);

const same = (...keys: Chord[]): PlatformKeys =>
  Object.freeze({ mac: keys, windows: keys, linux: keys });

const NO_KEYS = same();

const placed = (
  menu: MenuPlacement["menu"],
  group: string,
  order: number,
  submenu: string | null = null,
): MenuPlacement => ({ menu, group, order, submenu });

// a label that names its revision; without production state it names none
const named = (verb: string, name: string | null): string =>
  name === null ? `${verb}…` : `${verb} ${name}…`;

const locked = (p: Production): boolean => p.locked;
const lockable = (p: Production): boolean => p.locked && p.canLock;
const issuable = (p: Production): boolean => p.locked && p.canIssue;

const CONSEQUENCE: CommandDefinition["opens"] = {
  surface: "consequence_dialog",
  focus: "item",
};
const SEND: CommandDefinition["opens"] = { surface: "send", focus: "stay" };

/** A command absent until production state says `shown`; it acts on the open script for everyone on it. */
function productionCommand<const Id extends string>(
  id: Id,
  label: CommandDefinition["label"],
  more: {
    shown: (p: Production) => boolean;
    need?: Need;
    keys?: PlatformKeys;
    menus?: readonly MenuPlacement[];
    home?: string;
    palette?: CommandDefinition["palette"];
    opens?: CommandDefinition["opens"];
    checked?: CommandDefinition["checked"];
  },
): CommandDefinition<Id> {
  return {
    id,
    label,
    // listed with the menu it sits in first, else with Production
    group: more.menus?.[0]?.menu ?? "production",
    home: more.home ?? null,
    scope: "editor",
    keys: more.keys ?? NO_KEYS,
    keysFixed: false,
    when: more.need?.holds ?? null,
    whyNot: more.need?.reason ?? null,
    // a script without pages (Ink) has nothing to lock
    visible: (ctx) =>
      ctx.format !== "ink" &&
      ctx.production !== null &&
      more.shown(ctx.production),
    checked: more.checked ?? null,
    passThrough: null,
    menus: more.menus ?? [],
    palette: more.palette ?? { keywords: [] },
    opens: more.opens ?? null,
    reach: "others",
    setting: null,
  };
}

const MARK_MODE_LABELS = [
  ["collated", "Collated", 10],
  ["this_revision", "This revision only", 20],
  ["all", "All revisions", 30],
  ["since_full_draft", "Since the last full draft", 40],
  ["none", "None", 50],
] as const;

const markModeCommand = <const Mode extends Production["mode"]>(
  mode: Mode,
  label: string,
  order: number,
): CommandDefinition<`view.marks.${Mode}`> =>
  productionCommand(`view.marks.${mode}`, `Revision marks: ${label}`, {
    shown: locked,
    menus: [placed("view", "revisions", order, "Revision marks")],
    checked: (ctx) => ctx.production?.mode === mode,
  });

export const PRODUCTION_COMMANDS = defineCommands([
  productionCommand("production.lock", "Lock for production…", {
    shown: (p) => !p.locked && p.canLock,
    need: ONLINE,
    menus: [
      placed("production", "lock", 10),
      placed("title", "production", 10),
    ],
    home: "homeBeforeLock",
    palette: { keywords: ["issue", "blue pages", "revision"] },
    opens: CONSEQUENCE,
  }),
  productionCommand(
    "production.issue",
    (ctx) => named("Issue", ctx.production?.activeName ?? null),
    {
      shown: issuable,
      need: ONLINE_AND_SYNCED,
      menus: [placed("production", "issue", 10)],
      opens: SEND,
    },
  ),
  productionCommand(
    "production.recall",
    (ctx) => named("Recall", ctx.production?.recallName ?? null),
    {
      shown: (p) => p.recallOpen && p.canIssue,
      need: ONLINE_AND_SYNCED,
      menus: [placed("production", "issue", 20)],
      opens: SEND,
    },
  ),
  // the browser's next and previous tab, so bound on the desktop only
  productionCommand("production.markRevised", "Mark revised", {
    shown: locked,
    need: TEXT_SELECTED,
    keys: same("Mod+Shift+]"),
    menus: [placed("production", "marks", 10)],
  }),
  productionCommand("production.clearRevised", "Clear revised", {
    shown: locked,
    need: TEXT_SELECTED,
    keys: same("Mod+Shift+["),
    menus: [placed("production", "marks", 20)],
  }),
  productionCommand("production.lockPages", "Lock or unlock page numbers", {
    shown: lockable,
    need: ONLINE_WITH_PAGES,
    menus: [placed("production", "pages", 10)],
  }),
  productionCommand("production.lockAPages", "Lock A-pages", {
    shown: lockable,
    need: ONLINE_WITH_PAGES,
    menus: [placed("production", "pages", 20)],
  }),
  productionCommand("production.renumber", "Renumber", {
    shown: lockable,
    need: ONLINE_WITH_PAGES,
    menus: [placed("production", "pages", 30)],
  }),
  productionCommand("production.omitScene", "Omit scene", {
    shown: (p) => p.locked && p.selection === "scene",
    menus: [placed("production", "scenes", 10)],
  }),
  productionCommand("production.bringBackScene", "Bring back scene", {
    shown: (p) => p.locked && p.selection === "omitted_scene",
    menus: [placed("production", "scenes", 10)],
  }),
  productionCommand("production.changeLayout", "Change layout…", {
    shown: issuable,
    need: ONLINE,
    opens: CONSEQUENCE,
  }),
  productionCommand("production.unlock", "Unlock…", {
    shown: lockable,
    need: ONLINE,
    menus: [placed("production", "end", 10)],
    opens: CONSEQUENCE,
  }),
  productionCommand("production.end", "End production…", {
    shown: lockable,
    need: ONLINE,
    menus: [placed("production", "end", 20)],
    opens: CONSEQUENCE,
  }),
  productionCommand("view.pages", "Pages", {
    shown: locked,
    menus: [placed("view", "panels", 15)],
    opens: { surface: "left_panel", focus: "first" },
  }),
  ...MARK_MODE_LABELS.map(([mode, label, order]) =>
    markModeCommand(mode, label, order),
  ),
  productionCommand("view.colourRevised", "Colour revised pages", {
    shown: locked,
    menus: [placed("view", "revisions", 60)],
    checked: (ctx) => ctx.production?.tint === true,
  }),
]);
