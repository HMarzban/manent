// Export… on a project's row menu in the Library; a row with no document to open Send on has none.
import { DropdownMenuItem, useCommandState } from "@manent/ui";
import type { ReactNode } from "react";
import { useServices } from "../services/context.tsx";
import { exportTarget } from "./export-target.ts";

export function ExportProjectItem(props: {
  firstDocId: string | null;
}): ReactNode {
  const { firstDocId } = props;
  const { commands } = useServices();
  const { label } = useCommandState("library.exportProject");
  if (firstDocId === null) return null;
  return (
    <DropdownMenuItem
      onClick={() => {
        exportTarget.set(firstDocId);
        commands.run("library.exportProject", "menu");
      }}
    >
      {label}
    </DropdownMenuItem>
  );
}
