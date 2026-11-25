// Compiling Ink source through inkjs/full, collecting stripped 1-based compiler diagnostics without throwing.
import { Compiler } from "inkjs/full";
import type { Story } from "inkjs/full";

export interface InkProblem {
  /** 1-based line number in the compiled source. */
  readonly line: number;
  readonly severity: "error" | "warning";
  readonly message: string;
}

export type InkCompiled =
  | {
      readonly ok: true;
      readonly json: string;
      readonly problems: readonly InkProblem[];
    }
  | {
      readonly ok: false;
      readonly problems: readonly InkProblem[];
    };

const DIAGNOSTIC = new RegExp(
  "^(ERROR|WARNING): (?:'[^']*' )?line (\\d+): (.*)$",
);

export function parseInkDiagnostic(
  raw: string,
  fallbackSeverity: "error" | "warning",
): InkProblem {
  const match = DIAGNOSTIC.exec(raw);
  if (match !== null) {
    return {
      line: Number(match[2]),
      severity: match[1] === "WARNING" ? "warning" : "error",
      message: match[3]!,
    };
  }
  return { line: 1, severity: fallbackSeverity, message: raw };
}

/** Compiles Ink `source` and returns compiled JSON plus diagnostics, or `{ ok: false, problems }` on failure. */
export function compileInk(source: string): InkCompiled {
  const compiler = new Compiler(source);
  let story: Story | null = null;
  let thrown: unknown = null;
  try {
    story = compiler.Compile();
  } catch (cause) {
    thrown = cause;
  }
  const problems: InkProblem[] = [
    ...compiler.errors.map((entry) => parseInkDiagnostic(entry, "error")),
    ...compiler.warnings.map((entry) => parseInkDiagnostic(entry, "warning")),
  ];
  if (story === null || compiler.errors.length > 0) {
    if (problems.length === 0) {
      const message =
        thrown instanceof Error ? thrown.message : "compilation could not run";
      problems.push({ line: 1, severity: "error", message });
    }
    return { ok: false, problems };
  }
  const json = story.ToJson();
  return { ok: true, json: typeof json === "string" ? json : "{}", problems };
}
