// Where a Library row's document is, drawn as the row's last cell: an icon of its shape and the place word.
import { LIBRARY_WORDS } from "@manent/ui";
import { CloudCheckIcon, CloudUploadIcon, MonitorDotIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RowPlace } from "../../services/ports.ts";

/**
 * Row draws a row's place, or the word saying it is not on this device, as its last cell; a list of rows inside a
 * container gives that cell the status column's width, so that every row's place starts on one line.
 */
export const PLACE_COLUMN =
  "[&_.mn-row>span:last-child]:w-col-kind [&_.mn-row>span:last-child]:shrink-0 @lg:[&_.mn-row>span:last-child]:w-col-edited";

/** The head's cell over the status column, which has no word of its own. */
export const PLACE_HEAD = "w-col-kind shrink-0 @lg:w-col-edited";

/** A row's place in words with its icon; null when it is not on this device, which the row says as its unavailable word. */
function placeOf(
  place: RowPlace,
  shell: "web" | "desktop",
): { word: string; Icon: LucideIcon } | null {
  switch (place.kind) {
    case "synced":
      return { word: LIBRARY_WORDS.synced, Icon: CloudCheckIcon };
    case "waiting":
      return {
        word: LIBRARY_WORDS.waiting(place.count),
        Icon: CloudUploadIcon,
      };
    case "never_synced":
      return {
        word: LIBRARY_WORDS.neverSynced(shell === "desktop"),
        Icon: MonitorDotIcon,
      };
    case "not_on_device":
      return null;
  }
}

/** A row's place, drawn at its end: the place word, or the unavailable word that keeps the row from opening. */
export function placeProps(
  place: RowPlace,
  shell: "web" | "desktop",
): { trailing: readonly ReactNode[]; unavailable?: string } {
  const shown = placeOf(place, shell);
  if (shown === null)
    return { trailing: [], unavailable: LIBRARY_WORDS.notOnDevice };
  const { word, Icon } = shown;
  return {
    trailing: [
      <span className="flex min-w-0 items-center gap-1 tabular-nums">
        <Icon aria-hidden="true" className="shrink-0" />
        <span className="truncate">{word}</span>
      </span>,
    ],
  };
}
