// The Library's status bar: the message slot, how many projects are on this device when some are not, and Commands.
import { COMMANDS } from "@manent/commands";
import type { CommandId } from "@manent/commands";
import { CommandButton, LIBRARY_WORDS, MessageSlot } from "@manent/ui";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import { ShellRegion } from "../../shell/regions.tsx";

const isRegistered = (id: string): id is CommandId =>
  COMMANDS.some((command) => command.id === id);

export function LibraryStatusBar(props: {
  projects: readonly ProjectItem[];
}): ReactNode {
  const { projects } = props;
  const { messages, commands } = useServices();
  const here = projects.filter(
    (project) => project.place.kind !== "not_on_device",
  ).length;
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-4 border-t border-line px-2 text-meta"
    >
      <MessageSlot
        queue={messages}
        run={(id) => {
          if (isRegistered(id)) commands.run(id, "control");
        }}
        registered={isRegistered}
      />
      {here < projects.length ? (
        <span>{LIBRARY_WORDS.onDevice(here, projects.length)}</span>
      ) : null}
      <CommandButton id="app.palette" size="sm" />
    </ShellRegion>
  );
}
