// The status bar's readouts, in the order drawn at its start; a feature adds its readout with one line.
import type { DocKind } from "@manent/sync-protocol";
import type { ComponentType } from "react";
import { ElementReadout, PageReadout, SceneReadout } from "./status-bar.tsx";
import { FormatReadout } from "./format-readout.tsx";
import { InkProblemsReadout } from "./ink-problems-readout.tsx";
import { WordCountReadout } from "./word-count-readout.tsx";
import { TimingReadout } from "../../timing/readout.tsx";
import { RowReadout } from "../../rundown/row-readout.tsx";
import { GoalReadout } from "../../goals/goal-readout.tsx";

export interface StatusReadout {
  readonly id: string;
  /** The kinds of document the readout is drawn for. */
  readonly kinds: readonly DocKind[];
  readonly Readout: ComponentType<{ docId: string }>;
}

export const STATUS_READOUTS: readonly StatusReadout[] = [
  { id: "element", kinds: ["script"], Readout: ElementReadout },
  { id: "page", kinds: ["script", "ink"], Readout: PageReadout },
  { id: "words", kinds: ["script"], Readout: WordCountReadout },
  { id: "scene", kinds: ["script"], Readout: SceneReadout },
  { id: "timing", kinds: ["script"], Readout: TimingReadout },
  { id: "format", kinds: ["script", "ink"], Readout: FormatReadout },
  {
    id: "ink_problems",
    kinds: ["script", "ink"],
    Readout: InkProblemsReadout,
  },
  { id: "row", kinds: ["rundown"], Readout: RowReadout },
  { id: "goal", kinds: ["script"], Readout: GoalReadout },
];
