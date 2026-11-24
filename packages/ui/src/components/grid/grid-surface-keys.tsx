// Routes surface-scoped command shortcuts (Delete, Mod+Enter, Alt/Opt+Up/Down) inside the grid.
import { COMMANDS } from "@manent/commands";
import type { CommandDefinition, SurfaceId } from "@manent/commands";
import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import { useCommands } from "../../commands-react/commands-context.tsx";
import { createKeyResolver } from "../../commands-react/key-resolver.ts";

export type SurfaceKeyRunner = (event: KeyboardEvent) => boolean;

interface GridSurfaceKeysProps {
  readonly surface: SurfaceId;
  readonly commands?: readonly CommandDefinition[];
  readonly runnerRef: RefObject<SurfaceKeyRunner | null>;
}

/**
 * Binds `runnerRef` to a resolver for every command scoped to `surface:<id>`.
 * Returns `true` from the runner when a command handled the press (not `"passed"`).
 */
export function GridSurfaceKeys({
  surface,
  commands = COMMANDS,
  runnerRef,
}: GridSurfaceKeysProps): null {
  const { service, resolved } = useCommands();
  const ids = useMemo(() => {
    const scope = `surface:${surface}`;
    return commands
      .filter((command) => command.scope === scope)
      .map((command) => command.id);
  }, [commands, surface]);

  const resolve = useMemo(
    () =>
      createKeyResolver({
        table: () =>
          ids.flatMap((id) =>
            (resolved.get().effective.get(id) ?? []).map((chord) => ({
              id,
              chord,
            })),
          ),
      }),
    [ids, resolved],
  );

  useEffect(() => {
    runnerRef.current = (event) => {
      const id = resolve(event);
      if (id === null) return false;
      return service.run(id, "key") !== "passed";
    };
    return () => {
      runnerRef.current = null;
    };
  }, [resolve, service, runnerRef]);

  return null;
}
