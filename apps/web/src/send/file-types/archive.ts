// The project as one zip, written from the device: offered in Export for a script of any format with pages, never by
// Print.
import { ARCHIVE_WORDS } from "@manent/ui";
import { archiveSource } from "../../archive/archive-source.ts";
import { PAGED_FORMATS } from "../script-file.ts";
import type { ExportFileType } from "../script-file.ts";

export const archiveFileType: ExportFileType = {
  id: "archive",
  label: ARCHIVE_WORDS.projectArchive,
  mime: "application/zip",
  docKinds: ["script"],
  formats: PAGED_FORMATS,
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) => {
    const services = archiveSource.get();
    if (services === null) throw new Error("no person's services are known");
    // the writers and the zip load apart from the form
    const { writeProjectArchive } =
      await import("../../archive/project-archive.ts");
    return writeProjectArchive(services, work.docId, work.now);
  },
  // the archive is not drawn in the script font, and leaves out nothing it can tell before it is written
  leftOut: () => Promise.resolve(null),
};
