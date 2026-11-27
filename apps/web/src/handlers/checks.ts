import type { CommandHandlers } from "@manent/commands";
import { bindChecksServices } from "../checks/checks-context.ts";
import {
  CHECKS_PART,
  requestChecksOpen,
} from "../screens/document/checks-part.ts";
import { panelsActions } from "../state/panels.store.ts";
import type { HandlerDeps } from "./index.ts";

export function checksHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "checks.open"> {
  bindChecksServices(deps.services);
  return {
    "checks.open"() {
      requestChecksOpen();
      panelsActions.open("side", "details");
      deps.frame(() => {
        if (typeof document !== "undefined") {
          document
            .querySelector(`[${CHECKS_PART}]`)
            ?.scrollIntoView({ block: "nearest" });
        }
        deps.dom.focusSidePanel(`[${CHECKS_PART}]`);
      });
    },
  };
}
