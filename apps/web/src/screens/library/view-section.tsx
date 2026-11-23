// The head of a Library view other than Continue: its name, then what it lists or why it lists nothing.
import type { ReactNode } from "react";

/** `heading` names the view; `children` follow it, and `sentence` says why the view lists nothing, or is null. */
export function LibraryViewSection(props: {
  heading: string;
  sentence: string | null;
  children?: ReactNode;
}): ReactNode {
  const { heading, sentence, children } = props;
  return (
    <section aria-label={heading} className="flex min-h-0 flex-1 flex-col">
      <h2 className="mn-group-label">{heading}</h2>
      {sentence === null ? null : <p className="px-3 text-ui">{sentence}</p>}
      {children}
    </section>
  );
}
