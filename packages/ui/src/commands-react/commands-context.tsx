// The command service, the resolved bindings and the platform, handed down the tree once.
import type { CommandService, Resolved } from "@manent/commands";
import type { Platform } from "@manent/settings";
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { Subscribable } from "../subscribable/subscribable.ts";

interface Commands {
  service: CommandService;
  resolved: Subscribable<Resolved>;
  platform: Platform;
}

const CommandsContext = createContext<Commands | null>(null);

export function CommandsProvider(props: {
  service: CommandService;
  resolved: Subscribable<Resolved>;
  platform: Platform;
  children: ReactNode;
}): ReactNode {
  const { service, resolved, platform, children } = props;
  const value = useMemo(
    () => ({ service, resolved, platform }),
    [service, resolved, platform],
  );
  return (
    <CommandsContext.Provider value={value}>
      {children}
    </CommandsContext.Provider>
  );
}

/** What the nearest CommandsProvider holds; throws a TypeError outside one. */
export function useCommands(): Commands {
  const commands = useContext(CommandsContext);
  if (commands === null)
    throw new TypeError("a command was read outside a CommandsProvider");
  return commands;
}
