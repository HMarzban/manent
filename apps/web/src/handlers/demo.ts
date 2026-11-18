// The demo's command: the Tour tab of the side position.
import type { CommandHandlers } from "@manent/commands";
import { panelsActions } from "../state/panels.store.ts";

export function demoHandlers(): Pick<CommandHandlers, "demo.tour"> {
  return { "demo.tour": () => panelsActions.toggle("side", "tour") };
}
