// The status bar's readouts, in the order drawn at its start; a feature adds its readout with one line.
import type { DocKind } from "@manent/sync-protocol";
import type { ComponentType } from "react";
import { ElementReadout, PageReadout, SceneReadout } from "./status-bar.tsx";
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
  { id: "page", kinds: ["script"], Readout: PageReadout },
  { id: "scene", kinds: ["script"], Readout: SceneReadout },
  { id: "timing", kinds: ["script"], Readout: TimingReadout },
  { id: "row", kinds: ["rundown"], Readout: RowReadout },
  { id: "goal", kinds: ["script"], Readout: GoalReadout },
];
