// More facts for the document's state bar, one hook per source, in order; a feature adds its source with one line.
import type { StateFact } from "@manent/ui";
import { useHistoryFacts } from "../../history/facts.ts";

export const STATE_FACT_SOURCES: readonly ((
  docId: string,
) => readonly StateFact[])[] = [useHistoryFacts];
