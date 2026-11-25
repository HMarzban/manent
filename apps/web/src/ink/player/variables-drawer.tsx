// Collapsible Ink variables drawer: in-place editors for number, boolean, and string story variables.
import type { InkVariable, InkVariableValue } from "@manent/formats";
import { Input, Switch } from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";

function stopDigitKeys(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
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
        <Input
          id={controlId}
          type="number"
          value={String(variable.value)}
          onKeyDown={stopDigitKeys}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(variable.name, parsed);
          }}
          className="h-control-sm w-24 text-end text-ui tabular-nums"
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
  readonly variables: readonly InkVariable[];
  readonly onChange: (name: string, value: InkVariableValue) => void;
}): ReactNode {
  const { variables, onChange } = props;
  if (variables.length === 0) return null;
  return (
    <div className="border-b border-line bg-well px-3 py-2">
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
