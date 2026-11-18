// The app's own commands: the palette, regions, the Library, the Sync centre, signing in and the person.
import type { CommandHandlers } from "@manent/commands";
import { chooseUrl } from "../session.ts";
import { dialogActions } from "../state/dialog.store.ts";
import { paletteActions } from "../state/palette.store.ts";
import type { HandlerDeps } from "./index.ts";

export function appHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "app.palette"
  | "app.goTo"
  | "app.nextRegion"
  | "app.previousRegion"
  | "app.library"
  | "app.syncCentre"
  | "app.signInToSync"
  | "app.switchPerson"
> {
  const { services, api, usePerson, router, dom } = deps;
  return {
    "app.palette"() {
      dom.rememberFocus();
      paletteActions.open("all");
    },
    "app.goTo"() {
      dom.rememberFocus();
      paletteActions.open("places");
    },
    "app.nextRegion": () => dom.focusNextRegion(1),
    "app.previousRegion": () => dom.focusNextRegion(-1),
    "app.library": () => router.navigate("/"),
    "app.syncCentre"() {
      dom.rememberFocus();
      dialogActions.open("sync_centre");
    },
    "app.signInToSync"() {
      void api.signIn(services.userId).then((result) => {
        if (result.ok) usePerson.getState().setPerson(result.person);
      });
    },
    "app.switchPerson": () => router.navigate(chooseUrl(router.here().href)),
  };
}
