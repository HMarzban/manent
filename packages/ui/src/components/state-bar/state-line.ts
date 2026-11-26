// One side of the state bar, as its words give it.

export type RevisionColour =
  | "white"
  | "blue"
  | "pink"
  | "yellow"
  | "green"
  | "goldenrod"
  | "buff"
  | "salmon"
  | "cherry"
  | "tan";

export interface StateLine {
  sentence: string;
  chip: RevisionColour | null;
  actions: readonly {
    label: string;
    commandId: string;
    tourTarget?: string;
  }[];
  /** The command of the ✕ named Dismiss at the line's end; null for a line that has none. */
  dismiss: string | null;
  attention: boolean;
}
