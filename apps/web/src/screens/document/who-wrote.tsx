// Details → Selection: who last wrote the caret's element, and who wrote it before them.
import type { WhoWroteResponse } from "@manent/sync-protocol";
import { HISTORY_WORDS, formatDayTime } from "@manent/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { useEditorFact } from "../../state/facts.store.ts";

function lineOf(answer: WhoWroteResponse | null, now: number): string {
  if (answer === null) return HISTORY_WORDS.noAuthor;
  const name = nameOf(answer.userId);
  const when = formatDayTime(answer.at, now);
  if (!answer.exact) return HISTORY_WORDS.writtenBefore(name, when);
  return HISTORY_WORDS.writtenBy(
    name,
    when,
    answer.previous === null ? null : nameOf(answer.previous),
  );
}

/** Nothing while the caret is in no block, and while the server cannot be asked. */
export function WhoWrote(props: { docId: string }): ReactNode {
  const { docId } = props;
  const { history } = useServices();
  const { now } = useEnvironment();
  const blockId = useEditorFact("blockId");
  const [line, setLine] = useState<{ blockId: string; text: string } | null>(
    null,
  );
  useEffect(() => {
    if (blockId === null) return undefined;
    let shown = true;
    history.whoWrote(docId, blockId).then(
      (answer) => {
        if (shown) setLine({ blockId, text: lineOf(answer, now()) });
      },
      () => {
        // the server cannot say now: the line stays away until the caret moves
        if (shown) setLine(null);
      },
    );
    return () => {
      shown = false;
    };
  }, [history, now, docId, blockId]);
  if (line === null || line.blockId !== blockId) return null;
  return <p className="text-meta text-fg-muted">{line.text}</p>;
}
