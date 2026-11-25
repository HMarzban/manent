import { WRITING_TOOLS_WORDS } from "@manent/ui";
import type { ExportFileType } from "../script-file.ts";

export const pickupLinesFileType: ExportFileType = {
  id: "pickup_lines",
  label: WRITING_TOOLS_WORDS.pickupLinesCsv,
  mime: "text/csv;charset=utf-8",
  docKinds: ["script"],
  formats: ["animation"],
  forms: ["export"],
  print: { offered: false, reason: null },
  lockedOnly: false,
  pagesOf: null,
  write: async (work) => {
    const { writePickupLinesCsv } =
      await import("../../numbers/report-files.ts");
    return writePickupLinesCsv(work);
  },
  leftOut: async (work) => {
    const { pickupLinesLeftOut } =
      await import("../../numbers/report-files.ts");
    return pickupLinesLeftOut(work);
  },
};
