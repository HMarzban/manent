// Calm grid footer bar on non-empty editable rundowns: Add row, Add header row, and Import rows.
import { Button, useCommandState, useCommands } from "@manent/ui";
import { FileDownIcon, MinusIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Quiet archival action strip docked beneath non-empty editable rundown grids so row creation and script import stay
 * one click away without duplicating `RundownEmpty`'s hero CTA.
 */
export function RundownFooterBar(props: {
  readonly readOnly: boolean;
  readonly hasRows: boolean;
}): ReactNode {
  const { readOnly, hasRows } = props;
  const { service } = useCommands();
  const addRow = useCommandState("rundown.addRow");
  const addHeader = useCommandState("rundown.addHeaderRow");
  const importRows = useCommandState("rundown.importRows");
  if (readOnly || !hasRows) return null;
  if (!addRow.visible && !addHeader.visible && !importRows.visible) return null;
  return (
    <div
      data-tour="rundown:footer"
      className="flex min-h-control shrink-0 flex-wrap items-center gap-1.5 border-t border-line bg-chrome px-3 py-1 text-ui"
    >
      {addRow.visible ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!addRow.enabled}
          className="h-control cursor-pointer gap-1.5 px-2 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg"
          onClick={() => service.run("rundown.addRow", "control")}
        >
          <PlusIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{addRow.label}</span>
        </Button>
      ) : null}
      {addHeader.visible ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!addHeader.enabled}
          className="h-control cursor-pointer gap-1.5 px-2 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg"
          onClick={() => service.run("rundown.addHeaderRow", "control")}
        >
          <MinusIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{addHeader.label}</span>
        </Button>
      ) : null}
      {importRows.visible ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!importRows.enabled}
          className="ms-auto h-control cursor-pointer gap-1.5 px-2 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg"
          onClick={() => service.run("rundown.importRows", "control")}
        >
          <FileDownIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{importRows.label}</span>
        </Button>
      ) : null}
    </div>
  );
}
