// What the script's checks look at before it is sent, one source per line; each source lives in its feature's folder.
import { livePagination } from "../editor-host/live-editor.ts";
import { outsideFontSentence } from "../send/output-checks.tsx";
import { bracketTimeCheck } from "../timing/checks.ts";
import { STAGE_2_CHECK_SOURCES } from "./script-sources.ts";

/** What can be done about a check from where it is listed. */
export interface CheckAction {
  readonly label: string;
  run(): void;
}

/** One thing that needs a look, said in one sentence. */
export interface Check {
  /** Unique within its source. */
  readonly id: string;
  readonly sentence: string;
  /** Null when the check offers nothing to do. */
  readonly action: CheckAction | null;
}

export interface CheckSource {
  readonly id: string;
  /** What needs a look in the script `docId` now; empty when nothing does. Never called on a keystroke. */
  find(docId: string): readonly Check[];
}

/** The characters the script font cannot draw, which print as boxes; nothing while no editor holds the script. */
const outsideFont: CheckSource = {
  id: "outside_font",
  find(docId) {
    const pages = livePagination(docId);
    const sentence = pages === null ? null : outsideFontSentence(pages);
    return sentence === null
      ? []
      : [{ id: "outside_font", sentence, action: null }];
  },
};

export const CHECK_SOURCES: readonly CheckSource[] = [
  outsideFont,
  ...STAGE_2_CHECK_SOURCES,
  bracketTimeCheck,
];
