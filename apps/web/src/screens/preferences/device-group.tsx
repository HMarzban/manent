// The pane's groups of rows under a heading, and a row stating a fact.
import type { ReactNode } from "react";

export function Fact(props: { label: string; value: string }): ReactNode {
  return (
    <div className="flex min-h-row items-center justify-between gap-4 text-ui">
      <span>{props.label}</span>
      <span className="text-fg-muted">{props.value}</span>
    </div>
  );
}

export function Group(props: {
  heading: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="flex flex-col">
      <h3 className="mn-group-label px-0!">{props.heading}</h3>
      {props.children}
    </section>
  );
}
