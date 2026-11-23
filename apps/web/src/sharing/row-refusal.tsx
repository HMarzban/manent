// The line saying what was refused on a row of Share: the refusal line's look, announced as it appears.
import { TriangleExclamationPointIcon } from "lucide-react";
import type { ReactNode } from "react";

export function RowRefusal(props: { sentence: string }): ReactNode {
  return (
    <span role="alert" className="flex items-center gap-1 text-ui text-fg">
      <TriangleExclamationPointIcon
        aria-hidden="true"
        className="size-icon shrink-0 text-attention"
      />
      {props.sentence}
    </span>
  );
}
