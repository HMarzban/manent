// The Library's status bar: the message slot, how many projects are on this device when some are not, and Commands.
import { COMMANDS } from "@manent/commands";
import type { CommandId } from "@manent/commands";
import { LIBRARY_WORDS, MessageSlot } from "@manent/ui";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import { CommandsButton } from "../../shell/commands-button.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { ON_DEVICE } from "./row-place.tsx";

const isRegistered = (id: string): id is CommandId =>
  COMMANDS.some((command) => command.id === id);

export function LibraryStatusBar(props: {
  projects: readonly ProjectItem[];
}): ReactNode {
  const { projects } = props;
  const { messages, commands } = useServices();
  const here = projects.filter(
    (project) => ON_DEVICE[project.place.kind],
  ).length;
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-1 border-t border-line px-2 text-ui"
    >
      {projects.length > 0 ? (
        <span className="shrink-0 px-2 text-meta text-fg-muted tabular-nums">
          {here < projects.length
            ? LIBRARY_WORDS.onDevice(here, projects.length)
            : LIBRARY_WORDS.workspaceLine(projects.length, null)}
        </span>
      ) : null}
      <MessageSlot
        queue={messages}
        run={(id) => {
          if (isRegistered(id)) commands.run(id, "control");
        }}
        registered={isRegistered}
      />
      <CommandsButton />
    </ShellRegion>
  );
}
