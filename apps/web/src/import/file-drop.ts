// A file dropped anywhere on the window is imported; a drag of anything else is left to the page.
import type { DragEvent } from "react";
import { readImportFiles } from "./file-picker.ts";

const carriesFiles = (event: DragEvent): boolean =>
  event.dataTransfer.types.includes("Files");

const DROP = Object.freeze({
  onDragOver(event: DragEvent): void {
    if (!carriesFiles(event)) return;
    // the browser would otherwise refuse the drop, or open the file in place of the app
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  },
  onDrop(event: DragEvent): void {
    const { files } = event.dataTransfer;
    if (files.length === 0) return;
    event.preventDefault();
    // read before this returns: the drop's data is gone once the event has been handled
    const read = readImportFiles(files);
    void (async () => {
      // the opener is loaded apart from the first load
      const { fileOpener } = await import("./open-files.ts");
      await fileOpener()?.open(await read);
    })();
  },
});

/** The handlers of the window's drop target: a drop with files is taken whole and opened; one without is left alone. */
export function useFileDrop(): {
  onDragOver(event: DragEvent): void;
  onDrop(event: DragEvent): void;
} {
  return DROP;
}
