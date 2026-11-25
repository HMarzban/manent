// Rundown JSON file type: version 1 JSON of chosen rows across all columns.
import { RUNDOWN_SEND_WORDS } from "@manent/ui";
import {
  encodeUtf8File,
  rundownFileName,
} from "../../rundown/send/rundown-file-work.ts";
import type { RundownFileWork } from "../../rundown/send/rundown-file-work.ts";
import type { ExportFileType, WrittenFile } from "../script-file.ts";

/** Writes the rundown JSON file from `work`, loading `@manent/formats` dynamically. */
export async function writeRundownJsonFile(
  work: RundownFileWork,
): Promise<WrittenFile> {
  const { writeRundownJson } = await import("@manent/formats");
  const text = writeRundownJson(work.rundown, {
    airAt: work.airAt,
    target: work.target,
  });
  return {
    bytes: encodeUtf8File(text),
    name: rundownFileName(work, "rundown", ".json"),
  };
}

export const rundownJsonFileType: ExportFileType = {
  id: "rundown_json",
  label: RUNDOWN_SEND_WORDS.types.rundown_json,
  mime: "application/json",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(
      new RangeError("rundown_json is written through the rundown Send form"),
    ),
  leftOut: null,
};
