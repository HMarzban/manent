// Open beside: the palette, listing what can be opened beside the document.
import type { CommandHandlers } from "@manent/commands";
import { paletteActions } from "../state/palette.store.ts";
import type { HandlerDeps } from "./index.ts";

export function besideHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "doc.openBeside"> {
  return {
    "doc.openBeside"() {
      deps.dom.rememberFocus();
      paletteActions.open("beside");
    },
  };
}
