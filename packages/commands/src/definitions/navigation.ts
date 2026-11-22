// Moving through an open document: the next and previous scene, and Where am I?, which reads the caret's place aloud.
import type { PlatformKeys } from "../chord.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

/** A command of an open document that no menu holds: the Scenes tab and the palette are its ways in. */
const navCommand = <const Id extends string>(
  id: Id,
  label: string,
  keys: PlatformKeys,
): CommandDefinition<Id> & { readonly label: string } => ({
  id,
  label,
  group: "view",
  home: null,
  scope: "global",
  keys,
  keysFixed: false,
  when: (ctx) => ctx.docOpen,
  whyNot: () => "needs a document open",
  visible: null,
  checked: null,
  passThrough: null,
  menus: [],
  palette: { keywords: [] },
  opens: null,
  reach: "self",
  setting: null,
});

// the candidates off macOS are unconfirmed on real keyboards, so they ship unbound
const macOnly = (chord: string): PlatformKeys => ({
  mac: [chord],
  windows: [],
  linux: [],
});

export const NAVIGATION_COMMANDS = defineCommands([
  navCommand("nav.nextScene", "Next scene", macOnly("Mod+Alt+ArrowDown")),
  navCommand("nav.previousScene", "Previous scene", macOnly("Mod+Alt+ArrowUp")),
  navCommand("nav.whereAmI", "Where am I?", {
    mac: [],
    windows: [],
    linux: [],
  }),
]);
