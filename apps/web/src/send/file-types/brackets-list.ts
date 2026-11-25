// Brackets list file type: tab-separated list of every Bracket block across chosen stories.
import { RUNDOWN_SEND_WORDS } from "@manent/ui";
import {
  encodeUtf8File,
  rundownFileName,
} from "../../rundown/send/rundown-file-work.ts";
import type { RundownFileWork } from "../../rundown/send/rundown-file-work.ts";
import type { ExportFileType, WrittenFile } from "../script-file.ts";

/** Writes the brackets TSV file from `work`, loading `@manent/formats` dynamically. */
export async function writeBracketsListFile(
  work: RundownFileWork,
): Promise<WrittenFile> {
  const { writeBracketsList } = await import("@manent/formats");
  const text = writeBracketsList(work.rundown);
  return {
    bytes: encodeUtf8File(text),
    name: rundownFileName(work, "brackets", ".txt"),
  };
}

export const bracketsListFileType: ExportFileType = {
  id: "brackets_list",
  label: RUNDOWN_SEND_WORDS.types.brackets_list,
  mime: "text/plain;charset=utf-8",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(
      new RangeError("brackets_list is written through the rundown Send form"),
    ),
  leftOut: null,
};
