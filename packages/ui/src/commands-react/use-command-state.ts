// One command's state, read again whenever the service says the context or the bindings changed.
import type { CommandId, CommandState } from "@manent/commands";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { useCommands } from "./commands-context.tsx";

function isSameState(a: CommandState, b: CommandState): boolean {
  return (
    a.enabled === b.enabled &&
    a.visible === b.visible &&
    a.checked === b.checked &&
    a.label === b.label &&
    a.whyNot === b.whyNot &&
    a.keys.length === b.keys.length &&
    a.keys.every((key, i) => key === b.keys[i])
  );
}

/** The same object for as long as the state is equal, so a component re-renders only when it changed. */
export function useCommandState(id: CommandId): CommandState {
  const { service } = useCommands();
  const last = useRef<CommandState | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => service.subscribe(listener),
    [service],
  );
  const read = useCallback((): CommandState => {
    const next = service.state(id);
    if (last.current !== null && isSameState(last.current, next))
      return last.current;
    last.current = next;
    return next;
  }, [service, id]);
  return useSyncExternalStore(subscribe, read);
}
