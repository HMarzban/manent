// A writer's note in the script.
import { isTextAnchor } from "./anchors.ts";
import type { TextAnchor } from "./anchors.ts";
import { isObject, isString } from "./shape.ts";

/** A writer's note in the script (the interface word "Note"). `at` is when it was written, null when the file gave no time. */
export interface ScriptNote {
  v: 1;
  anchor: TextAnchor | null;
  text: string;
  writerName: string | null;
  at: number | null;
}

/** Whether a stored value is a note of this version, by the type of every field; its anchor is not looked for in any block. */
export function isScriptNote(value: unknown): value is ScriptNote {
  return (
    isObject(value) &&
    value.v === 1 &&
    (value.anchor === null || isTextAnchor(value.anchor)) &&
    isString(value.text) &&
    (value.writerName === null || isString(value.writerName)) &&
    (value.at === null || Number.isInteger(value.at))
  );
}
