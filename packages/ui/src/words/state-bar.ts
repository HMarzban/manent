// The state bar's words: what state the document is in (left) and what mode you are in (right).

import type {
  RevisionColour,
  StateLine,
} from "../components/state-bar/state-line.ts";
import { formatCount, joinNames } from "./format.ts";
import { OUTLINE_WORDS } from "./outline.ts";

/** A fact the state bar may say. Dates and times arrive formatted ("12 Nov", "Mon 22:41"); `over` is negative ("-0:48") when the rundown runs under. */
export type StateFact =
  | { kind: "viewing_version"; name: string | null; date: string }
  | { kind: "showing_changes"; name: string; date: string | null }
  | { kind: "writing_privately" }
  | { kind: "writing_suggestions" }
  | { kind: "driving"; name: string }
  | { kind: "following"; name: string }
  | { kind: "reading_aloud" }
  | { kind: "sprint"; left: string }
  | { kind: "prompter_files"; path: string }
  | { kind: "scene_writer"; name: string }
  | { kind: "changes_since_opened"; count: number; names: readonly string[] }
  | { kind: "air_window" }
  | { kind: "rundown_timing"; air: string; target: string; over: string }
  | {
      kind: "recall";
      colour: RevisionColour;
      name: string;
      at: string;
      people: number;
    }
  | {
      kind: "revision";
      colour: RevisionColour;
      name: string;
      started: string;
      pages: number;
    }
  | {
      kind: "marks_not_collated";
      mode: "this_revision" | "since_full_draft";
      colour: RevisionColour;
      name: string;
    }
  | { kind: "marks_not_collated"; mode: "all" | "none" }
  | { kind: "role_comment" }
  | { kind: "reader_draft"; name: string; date: string }
  | { kind: "prompter_send" }
  | { kind: "outline_start"; beats: number };

type Kind = StateFact["kind"];

// Each side shows the first fact true in its order; the others wait.
const RIGHT_ORDER: readonly Kind[] = [
  "viewing_version",
  "showing_changes",
  "writing_privately",
  "writing_suggestions",
  "driving",
  "following",
  "reading_aloud",
  "sprint",
  "prompter_files",
  "scene_writer",
  "changes_since_opened",
];
const LEFT_ORDER: readonly Kind[] = [
  "air_window",
  "rundown_timing",
  "recall",
  "revision",
  "marks_not_collated",
  "role_comment",
  "reader_draft",
  "prompter_send",
  "outline_start",
];

const AIR_WINDOW =
  "In the air window — prompter text changes only when you send it.";
const SHOW_COLLATED = {
  label: "Show collated",
  commandId: "view.marks.collated",
} as const;

type Action = StateLine["actions"][number];

const line = (
  sentence: string,
  actions: readonly Action[] = [],
): StateLine => ({
  sentence,
  chip: null,
  actions,
  dismiss: null,
  attention: false,
});

function timing(fact: Extract<StateFact, { kind: "rundown_timing" }>): string {
  const over = fact.over.startsWith("-")
    ? `Under ${fact.over.slice(1)}`
    : `Over ${fact.over}`;
  return `Air ${fact.air} · Target ${fact.target} · ${over}`;
}

function marks(
  fact: Extract<StateFact, { kind: "marks_not_collated" }>,
): string {
  switch (fact.mode) {
    case "this_revision":
      return `Showing ${fact.name} only`;
    case "all":
      return "Showing all revisions";
    case "since_full_draft":
      return `Showing revisions since ${fact.name}, the last full draft`;
    case "none":
      return "Revision marks hidden";
  }
}

/** The line for `fact`; `facts` is every fact, which the air window joins to the rundown's timing. */
function lineFor(fact: StateFact, facts: readonly StateFact[]): StateLine {
  switch (fact.kind) {
    case "viewing_version":
      return line(
        fact.name === null
          ? `Viewing the version from ${fact.date}`
          : `Viewing ${fact.name}, ${fact.date}`,
        [{ label: "Back to Working", commandId: "history.backToWorking" }],
      );
    case "showing_changes":
      return line(
        fact.date === null
          ? `Showing changes since ${fact.name}`
          : `Showing changes since ${fact.name}, ${fact.date}`,
        [{ label: "Hide", commandId: "history.hideChanges" }],
      );
    case "writing_privately":
      return line("Writing privately — only you can see this", [
        { label: "Hand in…", commandId: "writing.handIn" },
      ]);
    case "writing_suggestions":
      return line("Writing as suggestions — others accept or decline", [
        { label: "Stop", commandId: "writing.stopSuggestions" },
      ]);
    case "driving":
      return line(`${fact.name} is driving`, [
        { label: "Pitch", commandId: "room.pitch" },
        { label: "Take keys", commandId: "room.takeKeys" },
      ]);
    case "following":
      return line(`Following ${fact.name}`, [
        { label: "Stop", commandId: "room.stopFollowing" },
      ]);
    case "reading_aloud":
      return line("Reading aloud", [
        { label: "Stop", commandId: "readAloud.stop" },
      ]);
    case "sprint":
      return line(`Sprint ${fact.left} left`, [
        { label: "End", commandId: "sprint.end" },
      ]);
    case "prompter_files":
      return line(`Writing prompter files to ${fact.path}`, [
        { label: "Stop", commandId: "prompter.stopFiles" },
      ]);
    case "scene_writer":
      return line(`${fact.name} is writing this scene`);
    case "changes_since_opened":
      return {
        ...line(
          fact.count === 1
            ? `1 change by ${joinNames(fact.names)} since you last opened`
            : `${formatCount(fact.count)} changes by ${joinNames(fact.names)} since you last opened`,
          [{ label: "Show", commandId: "history.showSinceOpened" }],
        ),
        dismiss: "history.dismissSinceOpened",
      };
    case "air_window": {
      const rundown = facts.find((f) => f.kind === "rundown_timing");
      return {
        ...line(rundown ? `${timing(rundown)} · ${AIR_WINDOW}` : AIR_WINDOW),
        attention: true,
      };
    }
    case "rundown_timing":
      return line(timing(fact));
    case "recall": {
      const revision = facts.find((f) => f.kind === "revision");
      return line(
        fact.people === 1
          ? `${fact.name} issued ${fact.at} to 1 person`
          : `${fact.name} issued ${fact.at} to ${formatCount(fact.people)} people`,
        [
          { label: `Recall ${fact.name}…`, commandId: "production.recall" },
          ...(revision !== undefined && revision.pages > 0
            ? [
                {
                  label: `Issue ${revision.name}…`,
                  commandId: "production.issue",
                },
              ]
            : []),
        ],
      );
    }
    case "revision":
      return {
        ...line(
          fact.pages === 1
            ? `${fact.name.toUpperCase()} revision · started ${fact.started} · 1 page revised`
            : `${fact.name.toUpperCase()} revision · started ${fact.started} · ${formatCount(fact.pages)} pages revised`,
          [{ label: `Issue ${fact.name}…`, commandId: "production.issue" }],
        ),
        chip: fact.colour,
      };
    case "marks_not_collated":
      return line(marks(fact), [SHOW_COLLATED]);
    case "role_comment":
      return line("View only — you can comment");
    case "reader_draft":
      return line(`${fact.name}, ${fact.date}`, [
        {
          label: "Changes since you last read",
          commandId: "history.sinceLastRead",
        },
        { label: "Read aloud", commandId: "readAloud.start" },
      ]);
    case "prompter_send":
      return line("", [
        { label: "Send to prompter", commandId: "prompter.send" },
      ]);
    case "outline_start":
      return line(OUTLINE_WORDS.stateBar(fact.beats), [
        {
          label: OUTLINE_WORDS.startScript,
          commandId: "outline.startScript",
        },
      ]);
  }
}

function first(
  order: readonly Kind[],
  facts: readonly StateFact[],
): StateLine | null {
  for (const kind of order) {
    const fact = facts.find((f) => f.kind === kind);
    if (fact) return lineFor(fact, facts);
  }
  return null;
}

/** One sentence a side: the first true fact in each side's order, or null when none is. */
export function stateBarLines(facts: readonly StateFact[]): {
  left: StateLine | null;
  right: StateLine | null;
} {
  return { left: first(LEFT_ORDER, facts), right: first(RIGHT_ORDER, facts) };
}
