// The app's own commands: the palette, regions, the Library, the Sync centre, signing in and the person.
import type { CommandHandlers } from "@manent/commands";
import { chooseUrl } from "../session.ts";
import { dialogActions } from "../state/dialog.store.ts";
import {
  paletteActions,
  selectors as paletteSelectors,
} from "../state/palette.store.ts";
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
  const { services, api, usePerson, router, dom, nodeCloud } = deps;
  return {
    "app.palette"() {
      // pressed while the palette is open, Commands or its key closes it
      if (paletteSelectors.isOpen()) {
        paletteActions.close();
        dom.restoreFocus();
        return;
      }
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
      // on desktop the node signs the person in, and the window's own token stays the node's
      if (nodeCloud !== null) {
        void nodeCloud.signIn();
        return;
      }
      void api.signIn(services.userId).then((result) => {
        if (result.ok) usePerson.getState().setPerson(result.person);
      });
    },
    "app.switchPerson": () => router.navigate(chooseUrl(router.here().href)),
  };
}
