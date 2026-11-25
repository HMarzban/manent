// Copy link: the address of the open script, or of a version in History, for people who already have access.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

// on desktop a link opens for someone else only through the cloud the node syncs with
const reachable = (ctx: CommandContext): boolean =>
  ctx.shell === "web" || ctx.signedIn;

function copyLinkCommand<const Id extends string>(
  id: Id,
  more: Pick<CommandDefinition, "group" | "menus" | "palette">,
): CommandDefinition<Id> {
  return {
    id,
    label: "Copy link",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: reachable,
    whyNot: () => "needs a connection",
    visible: (ctx) => ctx.docOpen,
    checked: null,
    passThrough: null,
    opens: null,
    reach: "self",
    setting: null,
    ...more,
  };
}

export const LINKS_COMMANDS = defineCommands([
  copyLinkCommand("doc.copyLink", {
    group: "title",
    menus: [{ menu: "title", group: "send", order: 50, submenu: null }],
    palette: { keywords: ["url", "address"] },
  }),
  // the selected version's address, from its row menu
  copyLinkCommand("history.copyLink", {
    group: "file",
    menus: [],
    palette: { hidden: "the version row menu's item" },
  }),
]);
