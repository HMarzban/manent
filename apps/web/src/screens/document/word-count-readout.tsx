// Quiet manuscript word-count readout in the status bar; clicks open Details → Book → Numbers.
import { Button, READOUT_WORDS } from "@manent/ui";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { openDetailsAt } from "./details-tab.tsx";

function WordCountButton(): ReactNode {
  const { frame } = useEnvironment();
  const wordCount = useEditorFact("wordCount");
  if (wordCount === null) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="status:words"
      className="shrink-0 text-meta font-normal text-fg-muted tabular-nums max-sm:hidden"
      onClick={() => openDetailsAt("script", frame)}
    >
      {READOUT_WORDS.words(wordCount)}
    </Button>
  );
}

/** Shown on manuscript documents only; zero fact subscriptions on other formats. */
export function WordCountReadout(props: { readonly docId: string }): ReactNode {
  const services = useServices();
  const store = services.openScriptStore(props.docId);
  const subscribeFormat = useCallback(
    (notify: () => void) => store.subscribe("script.format", notify),
    [store],
  );
  const format = useSyncExternalStore(subscribeFormat, () =>
    store.get("script.format"),
  );
  return format === "manuscript" ? <WordCountButton /> : null;
}
