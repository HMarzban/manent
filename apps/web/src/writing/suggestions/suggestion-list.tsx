// To review's suggestion entries: each one's line, its two wordings, and Use this and Keep as it was.
import type { CrdtDoc } from "@manent/crdt";
import {
  Button,
  REVIEW_WORDS,
  Row,
  SUGGESTIONS_WORDS,
  formatCount,
  useSubscribable,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { sceneWords } from "../../services/sync/review-actions.ts";
import { decide, wordingOf } from "./decide.ts";
import type { Decision } from "./decide.ts";
import { useSuggestions } from "./review-source.ts";
import type { Suggestion } from "./suggestion-index.ts";

const CHOICES: readonly { label: string; decision: Decision }[] = [
  { label: SUGGESTIONS_WORDS.useThis, decision: "use" },
  { label: SUGGESTIONS_WORDS.keepAsItWas, decision: "keep" },
];

function SuggestionRow(props: {
  suggestion: Suggestion;
  doc: CrdtDoc;
  acted(): void;
}): ReactNode {
  const { suggestion, doc } = props;
  const { userId, messages } = useServices();
  const blockId = String(suggestion.blocks[0]?.attrs?.id);
  // a walk of the script, so once per entry rather than on every change to its text
  const scene = useMemo(() => sceneWords(doc, blockId), [doc, blockId]);
  const name =
    suggestion.authorUserId === userId ? null : nameOf(suggestion.authorUserId);
  return (
    <div
      data-review-block={blockId}
      className="flex flex-col gap-2 border-b border-line pb-3"
    >
      <Row
        leading={
          <TriangleExclamationPointIcon
            aria-hidden="true"
            className="size-icon text-attention"
          />
        }
      >
        {SUGGESTIONS_WORDS.suggested(scene, name)}
      </Row>
      {(["keep", "use"] as const).map((decision) => (
        // attribution label stays outside <p> so To review's quoted <p> cadence and textContent stay exact
        <div key={decision} className="mx-3 flex flex-col gap-0.5">
          <span className="text-micro font-medium text-fg-muted">
            {decision === "use"
              ? SUGGESTIONS_WORDS.suggestedLabel
              : SUGGESTIONS_WORDS.beforeLabel}
          </span>
          <p
            data-tone={decision === "use" ? "suggested" : "keep"}
            className="mn-review-quote ps-2 text-ui whitespace-pre-wrap"
          >
            {wordingOf(suggestion, decision)}
          </p>
        </div>
      ))}
      <div className="flex flex-wrap gap-1 px-3">
        {CHOICES.map((choice) => (
          <Button
            key={choice.decision}
            variant="outline"
            size="sm"
            onClick={() => {
              decide(doc, suggestion, choice.decision, messages);
              props.acted();
            }}
          >
            {choice.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The suggestions in To review, after its passages; a decision moves focus to the next entry, or to the caret. */
export function SuggestionList(props: {
  docId: string;
  focusPending: () => boolean;
}): ReactNode {
  const { docId, focusPending } = props;
  const { review } = useServices();
  const { dom } = useEnvironment();
  const followed = useSuggestions(docId);
  const passages = useSubscribable(review.entries(docId)).length;
  const list = useRef<HTMLDivElement | null>(null);
  // the place of the entry decided, so focus goes to the one that takes it
  const acted = useRef<number | null>(null);
  useEffect(() => {
    focusPending();
    const at = acted.current;
    if (at === null) return;
    acted.current = null;
    const rows = list.current?.querySelectorAll("[data-review-block]") ?? [];
    const next = rows[Math.min(at, rows.length - 1)]?.querySelector("button");
    if (next == null) dom.focusPage();
    else next.focus();
  }, [followed, dom, focusPending]);
  if (followed === null || followed.suggestions.length === 0) return null;
  const { suggestions, doc } = followed;
  const rows = (
    <div ref={list}>
      {suggestions.map((suggestion, index) => (
        <SuggestionRow
          key={suggestion.id}
          suggestion={suggestion}
          doc={doc}
          acted={() => {
            // the last one takes the tab with it, so the caret has focus at once
            if (suggestions.length === 1 && passages === 0) dom.focusPage();
            else acted.current = index;
          }}
        />
      ))}
    </div>
  );
  // To review is one list: while it holds passages, their heading leads it
  if (passages > 0) return rows;
  return (
    <section aria-label={REVIEW_WORDS.heading} data-tour="to_review">
      <h3 className="mn-group-label">
        {[REVIEW_WORDS.heading, formatCount(suggestions.length)].join(" · ")}
      </h3>
      {rows}
    </section>
  );
}
