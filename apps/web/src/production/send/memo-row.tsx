// The Memo row of Issue and Recall: Manent's memo, and the person's own once they edit it.
import { Button, PRODUCTION_WORDS, SEND_WORDS, Textarea } from "@manent/ui";
import type { ReactNode } from "react";

/** The memo as Manent writes it until Edit makes it the person's own. */
export function MemoRow(props: {
  memo: string;
  edited: boolean;
  onEdit(memo: string): void;
}): ReactNode {
  if (props.edited)
    return (
      <Textarea
        aria-label={SEND_WORDS.memo}
        value={props.memo}
        onChange={(event) => props.onEdit(event.target.value)}
      />
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{props.memo}</span>
      <Button variant="link" size="sm" onClick={() => props.onEdit(props.memo)}>
        {PRODUCTION_WORDS.edit}
      </Button>
    </span>
  );
}
