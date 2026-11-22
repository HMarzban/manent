// The system's file picker, as File → Import… and the Library open it.
import type { ImportFile } from "./open-files.ts";

/** Reads every file whole, in the order given. */
export function readImportFiles(files: Iterable<File>): Promise<ImportFile[]> {
  return Promise.all(
    Array.from(files, async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

/** The files chosen, read whole; an empty list when the picker is closed without a choice. */
export function pickFiles(options: {
  accept: readonly string[];
}): Promise<ImportFile[]> {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = options.accept.join(",");
  return new Promise((resolve, reject) => {
    input.addEventListener("cancel", () => resolve([]));
    input.addEventListener("change", () =>
      readImportFiles(input.files ?? []).then(resolve, reject),
    );
    input.click();
  });
}
