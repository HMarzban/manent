// The palette's word for each menu: the groups it lists while empty, and a command's home.
import type { MenuId } from "@manent/settings";
import { MENU_WORDS } from "../words/document.ts";

/** The title and person menus are named by the document's title and the person's initials, so the palette has no word for them. */
export const MENU_LABELS: Readonly<Record<MenuId, string | null>> =
  Object.freeze({
    app: MENU_WORDS.app,
    file: MENU_WORDS.file,
    edit: MENU_WORDS.edit,
    view: MENU_WORDS.view,
    format: MENU_WORDS.format,
    script: MENU_WORDS.script,
    production: MENU_WORDS.production,
    window: MENU_WORDS.window,
    help: MENU_WORDS.help,
    title: null,
    person: null,
  });
