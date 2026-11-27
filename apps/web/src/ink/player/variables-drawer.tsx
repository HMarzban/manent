// Collapsible Ink variables drawer: in-place editors for number, boolean, and string story variables.
import type { InkVariable, InkVariableValue } from "@manent/formats";
import { INK_WORDS, Input, Switch } from "@manent/ui";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

function stopDigitKeys(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function parseFiniteNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (
    trimmed === "" ||
    trimmed === "-" ||
    trimmed === "+" ||
    trimmed === "." ||
    trimmed === "-." ||
    trimmed === "+."
  )
    return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed === 0 ? 0 : parsed;
}

function NumberVariableInput(props: {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly onChange: (name: string, value: InkVariableValue) => void;
}): ReactNode {
  const { id, name, value, onChange } = props;
  const [draft, setDraft] = useState<string>(() => String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  return (
    <Input
      id={id}
      type="number"
      value={editing ? draft : String(value)}
      onKeyDown={stopDigitKeys}
      onFocus={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setEditing(true);
        setDraft(next);
        const parsed = parseFiniteNumber(next);
        if (parsed !== null) onChange(name, parsed);
      }}
      onBlur={() => {
        const parsed = parseFiniteNumber(draft);
        setEditing(false);
        if (parsed !== null) {
          onChange(name, parsed);
          setDraft(String(parsed));
        } else {
          setDraft(String(value));
        }
      }}
      className="h-control-sm w-24 text-end text-ui tabular-nums"
    />
  );
}

function VariableRow(props: {
  readonly variable: InkVariable;
  readonly onChange: (name: string, value: InkVariableValue) => void;
}): ReactNode {
  const { variable, onChange } = props;
  const controlId = useId();

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label
        htmlFor={controlId}
        className="min-w-0 truncate font-mono text-meta text-fg"
      >
        {variable.name}
      </label>
      {typeof variable.value === "boolean" ? (
        <Switch
          id={controlId}
          checked={variable.value}
          onCheckedChange={(checked) => onChange(variable.name, checked)}
        />
      ) : typeof variable.value === "number" ? (
        <NumberVariableInput
          id={controlId}
          name={variable.name}
          value={variable.value}
          onChange={onChange}
        />
      ) : (
        <Input
          id={controlId}
          type="text"
          value={variable.value}
          onKeyDown={stopDigitKeys}
          onChange={(event) => onChange(variable.name, event.target.value)}
          className="h-control-sm w-40 text-ui"
        />
      )}
    </div>
  );
}

export function VariablesDrawer(props: {
  readonly id?: string;
  readonly variables: readonly InkVariable[];
  readonly onChange: (name: string, value: InkVariableValue) => void;
}): ReactNode {
  const { id, variables, onChange } = props;
  if (variables.length === 0) return null;
  return (
    <div
      id={id}
      role="region"
      aria-label={INK_WORDS.variablesToggle(variables.length)}
      data-ink-variables="true"
      className="border-b border-line bg-well px-3 py-2"
    >
      <div className="flex flex-col divide-y divide-line">
        {variables.map((variable) => (
          <VariableRow
            key={variable.name}
            variable={variable}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}
