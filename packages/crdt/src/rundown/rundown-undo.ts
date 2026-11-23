import type { CrdtDoc } from "../doc.ts";

export interface RundownUndo {
  undo(): void;
  redo(): void;
  stopCapturing(): void;
  destroy(): void;
}

export function createRundownUndo(
  _doc: CrdtDoc,
  _options: { trackedOrigins: readonly unknown[] },
): RundownUndo {
  return { undo() {}, redo() {}, stopCapturing() {}, destroy() {} };
}
