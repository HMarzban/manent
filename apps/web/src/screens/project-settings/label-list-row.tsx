// A row holding a list of labels a person adds, renames, removes and reorders: Act structure, and Drafts' ladder.
import { SETTINGS } from "@manent/settings";
import {
  Button,
  PROJECT_WORDS,
  Row,
  SortableList,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { CommitField } from "./commit-field.tsx";

type LabelKey = "project.acts" | "project.ladder";
type LabelWords = Readonly<Record<keyof typeof PROJECT_WORDS.ladder, string>>;

/** What the list is changing: one label's name, a new label's, or nothing. */
type Editing = { kind: "rename"; index: number } | { kind: "add" } | null;

// a label may be given twice, so an item's id is its label and which of its repeats it is
const SEPARATOR = "\u0000";
function entriesOf(
  labels: readonly string[],
): readonly { id: string; label: string }[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const repeat = seen.get(label) ?? 0;
    seen.set(label, repeat + 1);
    return { id: `${label}${SEPARATOR}${repeat}`, label };
  });
}

const moved = (
  labels: readonly string[],
  from: number,
  to: number,
): readonly string[] =>
  labels.toSpliced(from, 1).toSpliced(to, 0, labels[from]!);

function LabelListRow(props: {
  settingKey: LabelKey;
  words: LabelWords;
}): ReactNode {
  const { settingKey, words } = props;
  const store = useSettingsStore();
  const labels = useSetting(settingKey);
  const { writable } = store.explain(settingKey);
  const [editing, setEditing] = useState<Editing>(null);
  const labelId = useId();
  const write = (next: readonly string[]): void => {
    store.set(settingKey, next);
  };
  const entries = entriesOf(labels);
  const item = (index: number, label: string): ReactNode => {
    if (editing?.kind === "rename" && editing.index === index)
      return (
        <Row>
          <CommitField
            value={label}
            label={words.rename}
            autoFocus
            onCommit={(typed) => write(labels.with(index, typed))}
            onEnd={() => setEditing(null)}
          />
        </Row>
      );
    return (
      <Row
        trailing={
          writable
            ? [
                <Button
                  key="rename"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing({ kind: "rename", index })}
                >
                  {words.rename}
                </Button>,
                <Button
                  key="remove"
                  variant="ghost"
                  size="sm"
                  onClick={() => write(labels.toSpliced(index, 1))}
                >
                  {words.remove}
                </Button>,
              ]
            : []
        }
      >
        {/* the handle a drag starts from, by pointer or keys */}
        <span
          tabIndex={writable ? 0 : undefined}
          className="min-w-0 flex-1 truncate"
        >
          {label}
        </span>
      </Row>
    );
  };
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-2 py-1"
    >
      <span id={labelId} className="text-ui font-medium">
        {SETTINGS.get(settingKey).label}
      </span>
      {entries.length === 0 ? (
        <p className="text-ui text-fg-muted">{words.empty}</p>
      ) : writable ? (
        // a row's words start where the setting's label does
        <div className="-mx-3">
          <SortableList
            items={entries}
            orientation="vertical"
            onMove={(from, to) => write(moved(labels, from, to))}
            renderItem={(id) => {
              const index = entries.findIndex((entry) => entry.id === id);
              return item(index, entries[index]?.label ?? "");
            }}
          />
        </div>
      ) : (
        <div role="list" className="-mx-3">
          {entries.map((entry, index) => (
            <div key={entry.id} role="listitem">
              {item(index, entry.label)}
            </div>
          ))}
        </div>
      )}
      {!writable ? null : editing?.kind === "add" ? (
        <CommitField
          value=""
          label={words.add}
          autoFocus
          onCommit={(typed) => write([...labels, typed])}
          onEnd={() => setEditing(null)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setEditing({ kind: "add" })}
        >
          {words.add}
        </Button>
      )}
    </div>
  );
}

export const ActsRow = (): ReactNode => (
  <LabelListRow settingKey="project.acts" words={PROJECT_WORDS.acts} />
);

export const LadderRow = (): ReactNode => (
  <LabelListRow settingKey="project.ladder" words={PROJECT_WORDS.ladder} />
);
