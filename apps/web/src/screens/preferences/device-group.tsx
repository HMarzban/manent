// The pane's groups of rows inside a raised SettingsCard section, and a row stating a fact.
import type { ReactNode } from "react";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";

export function Fact(props: { label: string; value: string }): ReactNode {
  return (
    <div className="flex min-h-row flex-wrap items-center justify-between gap-4 text-ui">
      <span className="text-fg">{props.label}</span>
      <span className="text-fg-muted">{props.value}</span>
    </div>
  );
}

export function Group(props: {
  heading: string;
  children: ReactNode;
}): ReactNode {
  return (
    <SettingsCard asSection title={props.heading}>
      <div className="flex flex-col gap-2">{props.children}</div>
    </SettingsCard>
  );
}
