// The What row of Issue and Recall: the changed pages or the full draft, the pages a correction replaces, and the
// one sentence both say when nothing has changed.
import { PRODUCTION_WORDS, SEND_WORDS, Switch } from "@manent/ui";
import { CheckIcon } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { Choices } from "../choices.tsx";

const WORDS = PRODUCTION_WORDS;

function NothingSinceCallout(props: { readonly name: string }): ReactNode {
  return (
    <div className="flex items-center gap-2 rounded-control border border-line bg-subtle px-3 py-2 text-ui text-fg-muted">
      <CheckIcon aria-hidden="true" className="size-icon shrink-0 text-ok" />
      <span>{WORDS.nothingSince(props.name)}</span>
    </div>
  );
}

export type IssueWhat = "changed" | "full";

/** `since` names the revision nothing has changed since, while no page is revised; else null. */
export function IssueWhatRow(props: {
  name: string;
  since: string | null;
  what: IssueWhat;
  onWhat(what: IssueWhat): void;
  pages: number;
  scenes: number;
  added: readonly string[];
}): ReactNode {
  if (props.since !== null) return <NothingSinceCallout name={props.since} />;
  return (
    <Choices
      label={SEND_WORDS.what}
      value={props.what}
      onChoose={props.onWhat}
      choices={[
        {
          value: "changed",
          label: WORDS.changedPages(
            props.pages,
            props.scenes,
            props.added.join(", "),
          ),
        },
        { value: "full", label: WORDS.fullDraft(props.name) },
      ]}
    />
  );
}

/** A switch with its words beside it. */
export function Tick(props: {
  label: string;
  on: boolean;
  onChange(on: boolean): void;
}): ReactNode {
  const id = useId();
  return (
    <span className="flex items-center gap-2">
      <Switch
        checked={props.on}
        onCheckedChange={props.onChange}
        aria-labelledby={id}
      />
      <span id={id}>{props.label}</span>
    </span>
  );
}

/** Each page changed since the issue or the last correction, none ticked at first. */
export function RecallWhatRow(props: {
  name: string;
  pages: readonly string[];
  ticked: ReadonlySet<string>;
  onTick(label: string, on: boolean): void;
}): ReactNode {
  if (props.pages.length === 0)
    return <NothingSinceCallout name={props.name} />;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {props.pages.map((label) => (
        <li key={label}>
          <Tick
            label={label}
            on={props.ticked.has(label)}
            onChange={(on) => props.onTick(label, on)}
          />
        </li>
      ))}
    </ul>
  );
}
