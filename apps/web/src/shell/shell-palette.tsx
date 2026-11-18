// The shell's palette over commands and settings, loaded apart from the entry.
import { COMMANDS } from "@manent/commands";
import type { Scope } from "@manent/settings";
import {
  CommandPalette,
  createCommandSource,
  createSettingSource,
} from "@manent/ui";
import type { PaletteRow } from "@manent/ui";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { usePaletteOpen } from "../state/palette.store.ts";

/** The palette's words for what a setting applies to. */
const scopeWords = (
  shell: "web" | "desktop",
): Readonly<Record<Scope, string>> => ({
  personal: "yours",
  device: shell === "desktop" ? "this device" : "this browser",
  script: "this script",
});

/** The palette over commands and settings; a setting reads the open document's store, so its script settings show. */
export function ShellPalette(props: {
  docId: string | null;
  close(): void;
}): ReactNode {
  const { docId, close } = props;
  const services = useServices();
  const { where } = useEnvironment();
  const filter = usePaletteOpen();
  const [recent, setRecent] = useState<readonly string[]>([]);
  const sources = useMemo(() => {
    const base = {
      commands: COMMANDS,
      service: services.commands,
      platform: where.platform,
      shell: where.shell,
    };
    return [
      createCommandSource(base),
      createSettingSource({
        ...base,
        settings:
          docId === null ? services.settings : services.openScriptStore(docId),
        scopeWords: scopeWords(where.shell),
      }),
    ];
  }, [services, where, docId]);
  const run = (row: PaletteRow): void => {
    services.commands.run(row.id, "palette");
    setRecent((before) => [row.id, ...before.filter((id) => id !== row.id)]);
  };
  return (
    <CommandPalette
      open={filter !== null}
      filter={filter ?? "all"}
      sources={sources}
      onRun={run}
      onClose={close}
      recent={recent}
    />
  );
}
