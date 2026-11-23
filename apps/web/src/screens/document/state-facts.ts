// More facts for the document's state bar, one hook per source, in order; a feature adds its source with one line.
import type { StateFact } from "@manent/ui";
import { useHistoryFacts } from "../../history/facts.ts";
import { useProductionFacts } from "../../production/state-facts.ts";
import { useWritingFacts } from "../../writing/state-facts.ts";
import { useAssignmentFacts } from "../../assignment/state-facts.ts";
import { useFollowFacts } from "../../room/follow-facts.ts";
import { useDriverFacts } from "../../room/driver-facts.ts";
import { useOutlineStartFacts } from "../../outline-doc/start-fact.ts";

export const STATE_FACT_SOURCES: readonly ((
  docId: string,
) => readonly StateFact[])[] = [
  useHistoryFacts,
  useProductionFacts,
  useWritingFacts,
  useAssignmentFacts,
  useFollowFacts,
  useDriverFacts,
  useOutlineStartFacts,
];
