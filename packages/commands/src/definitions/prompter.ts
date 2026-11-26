// The commands of the prompter: sending stories, opening the prompter window and writing prompter files.
import type { PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition, MenuPlacement } from "../define.ts";
import { waitingReason } from "./production.ts";

/** What a command needs before it can run, with the reason clause said while it is missing. */
interface Need {
  holds(ctx: CommandContext): boolean;
  reason(ctx: CommandContext): string;
}

const NO_KEYS: PlatformKeys = Object.freeze({
  mac: [],
  windows: [],
  linux: [],
});

const placed = (
  menu: MenuPlacement["menu"],
  group: string,
  order: number,
): MenuPlacement => ({ menu, group, order, submenu: null });

const ONLINE: Need = {
  holds: (ctx) => ctx.online,
  reason: () => "needs a connection",
};

const SCRIPT_ROW: Need = {
  holds: (ctx) => ctx.prompter?.hasStory === true,
  reason: () => "needs a script row selected",
};

const STORY_SYNCED: Need = {
  holds: (ctx) => (ctx.prompter?.waiting ?? 0) === 0,
  reason: (ctx) => waitingReason(ctx.prompter?.waiting ?? 0),
};

const SENT_BEFORE: Need = {
  holds: (ctx) => ctx.prompter?.sentBefore === true,
  reason: () => "needs an earlier version sent to the prompter",
};

const RUNDOWN_SYNCED: Need = {
  holds: (ctx) => ctx.prompter?.synced === true,
  reason: () => "needs this rundown synced first",
};

/** Needs `first`, then `then`; the reason is that of the first one missing. */
const both = (first: Need, then: Need): Need => ({
  holds: (ctx) => first.holds(ctx) && then.holds(ctx),
  reason: (ctx) => (first.holds(ctx) ? then.reason(ctx) : first.reason(ctx)),
});

const SEND_NEED = both(both(ONLINE, SCRIPT_ROW), STORY_SYNCED);
const SEND_PREVIOUS_NEED = both(both(ONLINE, SCRIPT_ROW), SENT_BEFORE);

const canSendPrompter = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  ctx.prompter !== null &&
  ctx.prompter.canSend &&
  (ctx.prompter.hasStory
    ? ctx.prompter.storyFormat === "variety"
    : ctx.docKind === "rundown");

const canControlPrompter = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  ctx.docKind === "rundown" &&
  ctx.prompter !== null &&
  ctx.prompter.canSend;

const JUMP_HERE_NEED = both(ONLINE, {
  holds: (ctx) => ctx.prompter?.sentBefore === true,
  reason: () => "this row has nothing on the prompter",
});

function prompterCommand<const Id extends string>(
  id: Id,
  label: string,
  more: {
    visible: (ctx: CommandContext) => boolean;
    need?: Need;
    menus?: readonly MenuPlacement[];
    palette?: CommandDefinition["palette"];
    opens?: CommandDefinition["opens"];
    reach?: CommandDefinition["reach"];
  },
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    group: more.menus?.[0]?.menu ?? "script",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: more.need?.holds ?? null,
    whyNot: more.need?.reason ?? null,
    visible: more.visible,
    checked: null,
    passThrough: null,
    menus: more.menus ?? [],
    palette: more.palette ?? { keywords: [] },
    opens: more.opens ?? null,
    reach: more.reach ?? "self",
    setting: null,
  };
}

export const PROMPTER_COMMANDS = defineCommands([
  prompterCommand("prompter.send", "Send to prompter", {
    visible: canSendPrompter,
    need: SEND_NEED,
    palette: { keywords: ["prompter", "send"] },
    reach: "others",
  }),
  prompterCommand("prompter.sendPrevious", "Send previous", {
    visible: canSendPrompter,
    need: SEND_PREVIOUS_NEED,
    palette: { keywords: ["prompter"] },
    reach: "others",
  }),
  prompterCommand("view.presentOnPrompter", "Present on prompter", {
    visible: (ctx) =>
      ctx.docOpen && (ctx.docKind === "rundown" || ctx.prompter !== null),
    // right after view.presentToRoom (order 20 in view/people)
    menus: [placed("view", "people", 30)],
  }),
  prompterCommand("prompter.files", "Prompter files…", {
    visible: (ctx) =>
      ctx.shell === "desktop" && ctx.docOpen && ctx.docKind === "rundown",
    need: RUNDOWN_SYNCED,
    menus: [placed("title", "prompter", 10)],
    opens: { surface: "prompter_files", focus: "first" },
  }),
  prompterCommand("prompter.stopFiles", "Stop", {
    visible: (ctx) => ctx.shell === "desktop" && ctx.docOpen,
    palette: { hidden: "the state bar's action" },
  }),
  prompterCommand("prompter.takeControl", "Take control", {
    visible: canControlPrompter,
    need: ONLINE,
    palette: { keywords: ["prompter", "control", "scroll"] },
    reach: "others",
  }),
  prompterCommand("prompter.takeOver", "Take over", {
    visible: canControlPrompter,
    need: ONLINE,
    palette: {
      hidden: "the state bar's action while someone else controls the prompter",
    },
    reach: "others",
  }),
  prompterCommand("prompter.stopControlling", "Stop controlling", {
    visible: (ctx) =>
      canControlPrompter(ctx) && ctx.prompter?.controlling === true,
    palette: { keywords: ["prompter", "control", "stop"] },
    reach: "others",
  }),
  prompterCommand("prompter.jumpHere", "Jump prompter here", {
    visible: canControlPrompter,
    need: JUMP_HERE_NEED,
    palette: { keywords: ["prompter", "jump", "scroll"] },
    reach: "others",
  }),
]);
