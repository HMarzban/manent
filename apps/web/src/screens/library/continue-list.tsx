// Continue: the documents this person last worked on, across every project, each saying where it is.
import { LIBRARY_WORDS, NEW_PROJECT_CARDS, Row, VirtualRows } from "@manent/ui";
import type { ReactNode } from "react";
import type {
  ContinueItem,
  ProjectKind,
  RowPlace,
} from "../../services/ports.ts";

/** The kind's word, as its New project card names it. */
export function kindLabel(kind: ProjectKind): string {
  return NEW_PROJECT_CARDS.find((card) => card.kind === kind)?.label ?? "";
}

/** Where a row's document is, in words; null when it is not on this device, which the row says as its unavailable word. */
function placeWord(place: RowPlace, shell: "web" | "desktop"): string | null {
  switch (place.kind) {
    case "synced":
      return LIBRARY_WORDS.synced;
    case "waiting":
      return LIBRARY_WORDS.waiting(place.count);
    case "never_synced":
      return LIBRARY_WORDS.neverSynced(shell === "desktop");
    case "not_on_device":
      return null;
  }
}

// the place column's width, so that a table's columns line up whichever word a row's place is
export const PLACE_COLUMN = "inline-block w-36 truncate";

/** A row's place, drawn at its end: the place word, or the unavailable word that keeps the row from opening. */
export function placeProps(
  place: RowPlace,
  shell: "web" | "desktop",
): { trailing: readonly ReactNode[]; unavailable?: string } {
  const word = placeWord(place, shell);
  return word === null
    ? { trailing: [], unavailable: LIBRARY_WORDS.notOnDevice }
    : { trailing: [<span className={PLACE_COLUMN}>{word}</span>] };
}

export function ContinueList(props: {
  items: readonly ContinueItem[];
  shell: "web" | "desktop";
  open(docId: string): void;
}): ReactNode {
  const { items, shell, open } = props;
  const renderRow = (index: number): ReactNode => {
    const item = items[index];
    if (item === undefined) return null;
    return (
      <Row
        meta={[item.projectTitle, kindLabel(item.kind)].join(" · ")}
        onActivate={() => open(item.docId)}
        {...placeProps(item.place, shell)}
      >
        {item.title}
      </Row>
    );
  };
  return (
    <section
      aria-label={LIBRARY_WORDS.continueHeading}
      className="flex max-h-1/3 shrink-0 flex-col"
    >
      <h2 className="px-2 py-1 text-micro text-fg-muted uppercase">
        {LIBRARY_WORDS.continueHeading}
      </h2>
      <div className="min-h-0 flex-1">
        <VirtualRows
          count={items.length}
          rowHeight="two"
          label={LIBRARY_WORDS.continueHeading}
          renderRow={renderRow}
        />
      </div>
    </section>
  );
}
