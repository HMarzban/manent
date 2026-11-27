// Power-user trailing-value query parsing for inline numeric setting commands (e.g. "lines 50", "target 110", "read rate 12.5").

export type NumericCommandId =
  "doc.linesPerPage" | "project.readRate" | "project.targetPages";

export interface NumericQueryPrefill {
  readonly commandId: NumericCommandId;
  readonly value: string;
}

const VALUE_TOKEN = /^(?:\d+(?:\.\d+)?|default|reset|none)$/;
const DECIMAL_TOKEN = /^\d+(?:\.\d+)?$/;

const PREFIX_RULES: readonly {
  readonly commandId: NumericCommandId;
  readonly prefixes: readonly string[];
  readonly allowReset: boolean;
}[] = [
  {
    commandId: "doc.linesPerPage",
    prefixes: ["lines per page", "lines", "lpp", "page height"],
    allowReset: true,
  },
  {
    commandId: "project.readRate",
    prefixes: ["read rate", "rate", "cps"],
    allowReset: false,
  },
  {
    commandId: "project.targetPages",
    prefixes: ["target length", "target pages", "page target", "target"],
    allowReset: true,
  },
];

/**
 * Recognises a trailing numeric (or reset) argument after a numeric setting command name,
 * such as `"lines 50"`, `"read rate 12.5"` or `"target 110"`.
 */
export function parseNumericCommandQuery(
  query: string,
): NumericQueryPrefill | null {
  const normalized = query.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const lastSpace = normalized.lastIndexOf(" ");
  if (lastSpace <= 0) return null;
  const head = normalized.slice(0, lastSpace);
  const tail = normalized.slice(lastSpace + 1);
  if (!VALUE_TOKEN.test(tail)) return null;

  for (const rule of PREFIX_RULES) {
    if (!rule.allowReset && !DECIMAL_TOKEN.test(tail)) continue;
    if (rule.prefixes.includes(head)) {
      return { commandId: rule.commandId, value: tail };
    }
  }
  return null;
}
