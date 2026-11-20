// Preferences, and Undo and Redo run from outside the page and the fields: the open script's own history, Preferences'
// undo list, and the reverse a setting's message offers.
import type { CommandHandlers } from "@manent/commands";
import type { SectionId } from "@manent/settings";
import { safeNext } from "../session.ts";
import type { HandlerDeps, RoutePlace } from "./index.ts";

const PREFERENCES_ROUTE = "/preferences/$pane";
const DOCUMENT_ROUTE = "/s/$docId";

/** Where Preferences returns to while it is shown, validated as a path inside the app; elsewhere, here. */
function returnPlace(here: RoutePlace): string {
  if (here.routeId !== PREFERENCES_ROUTE) return here.href;
  const { from } = here.search;
  return safeNext(typeof from === "string" ? from : null);
}

const preferencesHref = (pane: SectionId, from: string): string =>
  `/preferences/${pane}?from=${encodeURIComponent(from)}`;

export function preferencesHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "app.preferences"
  | "app.shortcuts"
  | "edit.undo"
  | "edit.redo"
  | "settings.undo"
> {
  const { services, router, visitUndo } = deps;
  const onPreferences = (): boolean =>
    router.here().routeId === PREFERENCES_ROUTE;
  // a screen that hides the page never touches the script
  const showsPage = (): boolean => router.here().routeId === DOCUMENT_ROUTE;
  return {
    "app.preferences"() {
      const from = returnPlace(router.here());
      router.navigate(
        onPreferences() ? from : preferencesHref(services.lastPane.get(), from),
      );
    },
    "app.shortcuts": () =>
      router.navigate(preferencesHref("keyboard", returnPlace(router.here()))),
    // the page's and a field's own undo take the key before this runs; an undo with nothing to undo says nothing
    "edit.undo"() {
      if (onPreferences()) visitUndo.current?.undo();
      else if (showsPage()) services.editor.run("edit.undo");
    },
    "edit.redo"() {
      if (showsPage()) services.editor.run("edit.redo");
    },
    "settings.undo"() {
      const shown = services.messages.current();
      if (shown !== null && services.reverses.run(shown.id))
        services.messages.dismiss(shown.id);
    },
  };
}
