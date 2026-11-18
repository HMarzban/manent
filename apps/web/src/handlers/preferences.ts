// Preferences and the undo that belongs to it: its own screen's undo list, and the reverse a setting's message offers.
import type { CommandHandlers } from "@manent/commands";
import type { SectionId } from "@manent/settings";
import { safeNext } from "../session.ts";
import type { HandlerDeps, RoutePlace } from "./index.ts";

const PREFERENCES_ROUTE = "/preferences/$pane";

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
  return {
    "app.preferences"() {
      const from = returnPlace(router.here());
      router.navigate(
        onPreferences() ? from : preferencesHref(services.lastPane.get(), from),
      );
    },
    "app.shortcuts": () =>
      router.navigate(preferencesHref("keyboard", returnPlace(router.here()))),
    // the page's and a field's own undo take the key before this runs
    "edit.undo"() {
      if (onPreferences()) visitUndo.current?.undo();
    },
    // nothing outside the page and the fields keeps a redo list
    "edit.redo"() {},
    "settings.undo"() {
      const shown = services.messages.current();
      if (shown !== null && services.reverses.run(shown.id))
        services.messages.dismiss(shown.id);
    },
  };
}
