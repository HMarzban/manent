// One row in the Scenes tab's List view: a scene row with marks, people, length and menu, or an act/section/knot heading.
import { DOCUMENT_WORDS, Row } from "@manent/ui";
import { memo } from "react";
import type { ReactNode } from "react";
import { useServices } from "../services/context.tsx";
import {
  useIsCurrentOutline,
  useIsViewedOutline,
} from "../state/outline.store.ts";
import type { OutlineRow } from "../state/outline.store.ts";
import {
  ScenePeople,
  SceneTitle,
  isPersonMark,
  sceneRowMeta,
} from "./marks.tsx";
import type { SceneParts } from "./marks.tsx";
import { SceneRowMenu } from "./row-menu.tsx";

function SceneLine(props: {
  row: OutlineRow;
  parts: SceneParts;
  current: boolean;
  viewed: boolean;
  goTo: () => void;
}): ReactNode {
  const { row, parts, current, viewed, goTo } = props;
  if (row.omitted)
    return (
      <Row current={current} viewed={viewed} onActivate={goTo}>
        <span className="whitespace-pre text-fg-muted">
          {row.number === null
            ? DOCUMENT_WORDS.omitted
            : `${row.number}  ${DOCUMENT_WORDS.omitted}`}
        </span>
      </Row>
    );
  const marks = parts.extras.marks(row.blockId);
  const length = parts.extras.length(row);
  const lengthTitle =
    length === null
      ? undefined
      : (parts.extras.lengthTitle?.(row) ?? undefined);
  const meta = sceneRowMeta(marks, row.synopsis);
  const trailing: ReactNode[] = [
    ...(marks.some((mark) => mark.kind === "revised")
      ? [
          <span key="revised" aria-hidden="true">
            *
          </span>,
        ]
      : []),
    ...(length === null && !marks.some(isPersonMark)
      ? []
      : [
          <span key="length" className="flex items-center gap-2">
            <ScenePeople marks={marks} />
            {length === null ? null : (
              <span className="tabular-nums" title={lengthTitle}>
                {length}
              </span>
            )}
          </span>,
        ]),
  ];
  return (
    <SceneRowMenu
      docId={parts.docId}
      headingId={row.blockId}
      title={row.heading}
      items={parts.items}
    >
      {(handle) => (
        <Row
          current={current}
          viewed={viewed}
          onActivate={goTo}
          leading={
            row.number === null ? undefined : (
              <span className="w-6 text-end tabular-nums">{row.number}</span>
            )
          }
          meta={meta}
          trailing={trailing}
          menu={handle ?? undefined}
          menuReveal="hover"
        >
          <SceneTitle heading={row.heading} marks={marks} />
        </Row>
      )}
    </SceneRowMenu>
  );
}

/** An act or knot heads the entries after it; a stitch indents under its knot; a section groups scenes. */
export const OutlineLine = memo(function OutlineLine(props: {
  row: OutlineRow;
  parts: SceneParts;
}): ReactNode {
  const { row, parts } = props;
  const { editor } = useServices();
  const current = useIsCurrentOutline(row.blockId);
  const viewed = useIsViewedOutline(row.blockId);
  const goTo = () =>
    void editor.run({ kind: "go_to", blockId: row.blockId, offset: 0 });
  if (row.kind === "scene")
    return (
      <SceneLine
        row={row}
        parts={parts}
        current={current}
        viewed={viewed}
        goTo={goTo}
      />
    );
  const textClass =
    row.kind === "act" || row.kind === "knot"
      ? "font-semibold"
      : row.kind === "stitch"
        ? "ps-4"
        : "text-fg-muted italic";
  return (
    <Row current={current} viewed={viewed} onActivate={goTo}>
      <span className={textClass}>{row.heading}</span>
    </Row>
  );
});
