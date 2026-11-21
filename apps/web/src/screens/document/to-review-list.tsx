// To review's rows: each entry's words, its wordings and its choices, read with the open script.
import { sceneOf } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import {
  Button,
  REVIEW_WORDS,
  Row,
  formatCount,
  useSubscribable,
} from "@manent/ui";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import type { PersonReview } from "../../services/sync/later-index.ts";
import type { ReviewEntry } from "../../services/sync/review.ts";

type Entry = ReviewEntry & { id: string };

const textOf = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

/** The scene the block is in, in To review's words; null outside a scene or while the script is not open. */
function sceneWords(
  doc: CrdtDoc | null,
  blockId: string | null,
): string | null {
  const n = doc === null || blockId === null ? null : sceneOf(doc, blockId);
  return n === null ? null : REVIEW_WORDS.scene(n);
}

/** What the row says the passage is. */
function labelOf(entry: Entry, scene: string | null): string {
  if (entry.kind === "recovered") return REVIEW_WORDS.recoveredRow(scene);
  const names = entry.otherUserIds.map(nameOf);
  const [only] = names;
  if (only !== undefined && names.length === 1)
    return REVIEW_WORDS.bothChanged(scene, only);
  if (names.length > 1) return REVIEW_WORDS.severalChanged(scene, names);
  return REVIEW_WORDS.unknownChanged(scene);
}

/** The choices, in order: Keep as merged, Use mine, then the other side's wording for an overlap. */
function choicesOf(
  entry: Entry,
  doc: CrdtDoc,
  review: PersonReview,
): readonly { label: string; act(): void }[] {
  const keep = {
    label: REVIEW_WORDS.keepAsMerged,
    act: () => review.keepAsMerged(entry.id),
  };
  const mine = {
    label: REVIEW_WORDS.useMine,
    act: () => review.useMine(entry.id, doc),
  };
  if (entry.kind === "recovered") return [keep, mine];
  const names = entry.otherUserIds.map(nameOf);
  const theirs = {
    label:
      names.length > 0 && names.length < 3
        ? REVIEW_WORDS.useNamed(names)
        : REVIEW_WORDS.useOther,
    act: () => review.useTheirs(entry.id, doc),
  };
  return [keep, mine, theirs];
}

function EntryRow(props: {
  entry: Entry;
  doc: CrdtDoc;
  acted(): void;
}): ReactNode {
  const { entry, doc } = props;
  const { review } = useServices();
  const wordings =
    entry.kind === "recovered"
      ? [entry.text]
      : [textOf(entry.mine), textOf(entry.theirs)];
  return (
    <div data-review-block={entry.blockId ?? entry.id} className="pb-2">
      <Row>{labelOf(entry, sceneWords(doc, entry.blockId))}</Row>
      {wordings.map((text, index) => (
        <p key={index} className="px-2 text-ui whitespace-pre-wrap">
          {text}
        </p>
      ))}
      <div className="flex flex-wrap gap-1 px-2 pt-1">
        {choicesOf(entry, doc, review).map((choice) => (
          <Button
            key={choice.label}
            variant="outline"
            size="sm"
            onClick={() => {
              choice.act();
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

/** The open entries, the first section of the History tab; an action moves focus to the next one, or to the caret. */
export function ToReviewList(props: {
  docId: string;
  /** Focuses the entry history.review asked for, once drawn. */
  focusPending: () => boolean;
}): ReactNode {
  const { docId } = props;
  const { review } = useServices();
  const { dom } = useEnvironment();
  const entries = useSubscribable(review.entries(docId));
  const doc = review.docOf(docId);
  const list = useRef<HTMLDivElement | null>(null);
  // the place of the entry acted on, so focus goes to the one that takes it
  const acted = useRef<number | null>(null);
  const { focusPending } = props;
  useEffect(() => {
    focusPending();
    const at = acted.current;
    if (at === null) return;
    acted.current = null;
    const rows = list.current?.querySelectorAll("[data-review-block]") ?? [];
    const next = rows[Math.min(at, rows.length - 1)]?.querySelector("button");
    if (next == null) dom.focusPage();
    else next.focus();
  }, [entries, dom, focusPending]);
  if (doc === null || entries.length === 0) return null;
  return (
    <section aria-label={REVIEW_WORDS.heading} className="py-1">
      <h3 className="px-2 pt-2 text-micro text-fg-muted uppercase">
        {[REVIEW_WORDS.heading, formatCount(entries.length)].join(" · ")}
      </h3>
      <div ref={list}>
        {entries.map((entry, index) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            doc={doc}
            acted={() => {
              // the last one takes the tab with it, so the caret has focus at once
              if (entries.length === 1) dom.focusPage();
              else acted.current = index;
            }}
          />
        ))}
      </div>
    </section>
  );
}
