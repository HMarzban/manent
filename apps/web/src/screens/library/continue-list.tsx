// Continue: the documents this person last worked on, across every project, each saying where it is.
import { LIBRARY_WORDS, Row, VirtualRows, cn } from "@manent/ui";
import type { ReactNode } from "react";
import type { ContinueItem } from "../../services/ports.ts";
import { KindIcon, kindLabel } from "./project-kind.tsx";
import { PLACE_COLUMN, placeProps } from "./row-place.tsx";

/** Nothing is drawn while the person has worked on nothing. */
export function ContinueList(props: {
  items: readonly ContinueItem[];
  shell: "web" | "desktop";
  open(docId: string): void;
}): ReactNode {
  const { items, shell, open } = props;
  if (items.length === 0) return null;
  const renderRow = (index: number): ReactNode => {
    const item = items[index];
    if (item === undefined) return null;
    return (
      <Row
        leading={<KindIcon kind={item.kind} />}
        meta={[item.projectTitle, kindLabel(item.kind)].join(" · ")}
        onActivate={() => open(item.docId)}
        {...placeProps(item.place, shell)}
      >
        <span className="font-semibold">{item.title}</span>
      </Row>
    );
  };
  return (
    <section
      aria-label={LIBRARY_WORDS.continueHeading}
      className="@container flex shrink-0 flex-col"
    >
      <h2 className="mn-group-label">{LIBRARY_WORDS.continueHeading}</h2>
      <div className={cn("mn-table min-h-0", PLACE_COLUMN)}>
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
