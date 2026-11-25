// The kinds of file the Send forms offer, in As order; a type adds its line here over its own module in file-types/.
import type { FormatId } from "@manent/schema";
import type { DocKind } from "@manent/sync-protocol";
import type { SendFormId } from "../screens/send/form-ids.ts";
import { fdxFileType } from "./file-types/fdx.ts";
import { fountainFileType } from "./file-types/fountain.ts";
import { pdfFileType } from "./file-types/pdf.ts";
import { rundownPdfFileType } from "./file-types/rundown-pdf.ts";
import { rundownScriptsFileType } from "./file-types/rundown-scripts.ts";
import { varietyTwoColumnFileType } from "./file-types/variety-two-column.ts";
import { prompterTextFileType } from "./file-types/prompter-text.ts";
import { bracketsListFileType } from "./file-types/brackets-list.ts";
import { rundownJsonFileType } from "./file-types/rundown-json.ts";
import { archiveFileType } from "./file-types/archive.ts";
import { inkSourceFileType } from "./file-types/ink-source.ts";
import { inkProjectFileType } from "./file-types/ink-project.ts";
import { inkJsonFileType } from "./file-types/ink-json.ts";
import { lineDataJsonFileType } from "./file-types/line-data-json.ts";
import { lineDataXmlFileType } from "./file-types/line-data-xml.ts";
import { characterReportFileType } from "./file-types/character-report.ts";
import { characterReportPdfFileType } from "./file-types/character-report-pdf.ts";
import { sceneReportFileType } from "./file-types/scene-report.ts";
import { sceneReportPdfFileType } from "./file-types/scene-report-pdf.ts";
import { locationReportFileType } from "./file-types/location-report.ts";
import { locationReportPdfFileType } from "./file-types/location-report-pdf.ts";
import { pickupLinesFileType } from "./file-types/pickup-lines.ts";
import { sidesFileType } from "./file-types/sides.ts";
import type { ExportFileType } from "./script-file.ts";

export const EXPORT_FILE_TYPES: readonly ExportFileType[] = [
  pdfFileType,
  fdxFileType,
  fountainFileType,
  rundownPdfFileType,
  rundownScriptsFileType,
  varietyTwoColumnFileType,
  prompterTextFileType,
  bracketsListFileType,
  rundownJsonFileType,
  archiveFileType,
  inkSourceFileType,
  inkProjectFileType,
  inkJsonFileType,
  lineDataJsonFileType,
  lineDataXmlFileType,
  characterReportFileType,
  characterReportPdfFileType,
  sceneReportFileType,
  sceneReportPdfFileType,
  locationReportFileType,
  locationReportPdfFileType,
  pickupLinesFileType,
  sidesFileType,
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
