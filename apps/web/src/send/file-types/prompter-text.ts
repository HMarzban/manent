// Prompter text file type: UTF-8 spoken text of chosen stories in run order.
import { RUNDOWN_SEND_WORDS } from "@manent/ui";
import {
  encodeUtf8File,
  rundownFileName,
} from "../../rundown/send/rundown-file-work.ts";
import type { RundownFileWork } from "../../rundown/send/rundown-file-work.ts";
import type { ExportFileType, WrittenFile } from "../script-file.ts";

/** Writes the prompter text file from `work`, loading `@manent/formats` dynamically. */
export async function writePrompterTextFile(
  work: RundownFileWork,
): Promise<WrittenFile> {
  const { writePrompterText } = await import("@manent/formats");
  const text = writePrompterText(work.rundown);
  return {
    bytes: encodeUtf8File(text),
    name: rundownFileName(work, "prompter", ".txt"),
  };
}

export const prompterTextFileType: ExportFileType = {
  id: "prompter_text",
  label: RUNDOWN_SEND_WORDS.types.prompter_text,
  mime: "text/plain;charset=utf-8",
  docKinds: ["rundown"],
  formats: null,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: () =>
    Promise.reject(
      new RangeError("prompter_text is written through the rundown Send form"),
    ),
  leftOut: null,
};
