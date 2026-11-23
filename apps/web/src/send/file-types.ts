// The kinds of file the Send forms offer, in As order; a type adds its line here over its own module in file-types/.
import type { FormatId } from "@manent/schema";
import type { DocKind } from "@manent/sync-protocol";
import type { SendFormId } from "../screens/send/form-ids.ts";
import { fdxFileType } from "./file-types/fdx.ts";
import { fountainFileType } from "./file-types/fountain.ts";
import { pdfFileType } from "./file-types/pdf.ts";
import type { ExportFileType } from "./script-file.ts";

export const EXPORT_FILE_TYPES: readonly ExportFileType[] = [
  pdfFileType,
  fdxFileType,
  fountainFileType,
];

/** What decides which types a document is offered. */
export interface OfferedTo {
  readonly docKind: DocKind;
  readonly format: FormatId;
  /** Page numbers are locked. */
  readonly locked: boolean;
}

/** Whether `type` serves the document `to` describes. */
function serves(type: ExportFileType, to: OfferedTo): boolean {
  return (
    type.docKinds.includes(to.docKind) &&
    (type.formats === null || type.formats.includes(to.format)) &&
    (!type.lockedOnly || to.locked)
  );
}

/** The types `form`'s As row offers the document `to` describes, in list order. */
export function typesOffered(
  form: SendFormId,
  to: OfferedTo,
): ExportFileType[] {
  return EXPORT_FILE_TYPES.filter(
    (type) => type.forms.includes(form) && serves(type, to),
  );
}

/** The types Print offers the document `to` describes, in list order. */
export function typesPrinted(to: OfferedTo): ExportFileType[] {
  return EXPORT_FILE_TYPES.filter(
    (type) => type.print.offered && serves(type, to),
  );
}
