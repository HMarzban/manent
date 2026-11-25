// Dispatches each rundown file type id to its own module under send/file-types/.
import { writeBracketsListFile } from "../../send/file-types/brackets-list.ts";
import { writePrompterTextFile } from "../../send/file-types/prompter-text.ts";
import { writeRundownJsonFile } from "../../send/file-types/rundown-json.ts";
import { writeRundownPdfFile } from "../../send/file-types/rundown-pdf.ts";
import { writeRundownScriptsFile } from "../../send/file-types/rundown-scripts.ts";
import { writeVarietyTwoColumnFile } from "../../send/file-types/variety-two-column.ts";
import type { WrittenFile } from "../../send/script-file.ts";
import type {
  RundownFileTypeId,
  RundownFileWork,
  RundownFileWriter,
} from "./rundown-file-work.ts";

const RUNDOWN_FILE_WRITERS: Readonly<
  Record<RundownFileTypeId, RundownFileWriter>
> = Object.freeze({
  rundown_pdf: writeRundownPdfFile,
  rundown_scripts: writeRundownScriptsFile,
  variety_two_column: writeVarietyTwoColumnFile,
  prompter_text: writePrompterTextFile,
  brackets_list: writeBracketsListFile,
  rundown_json: writeRundownJsonFile,
});

/** Writes one rundown file for `typeId` using its dedicated file-type module. */
export function writeRundownFile(
  typeId: RundownFileTypeId,
  work: RundownFileWork,
): Promise<WrittenFile> {
  return RUNDOWN_FILE_WRITERS[typeId](work);
}
