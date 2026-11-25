// Driving an Ink story from live compiled source (preserving 1-based line numbers) or compiled JSON, surfacing runtime faults cleanly.
import { Compiler, Story } from "inkjs/full";
import { parseInkDiagnostic } from "./compile.ts";

export interface InkPassage {
  readonly text: string;
  /** 1-based source line of this passage; null when debug metadata is absent (JSON runtime). */
  readonly line: number | null;
  readonly knot: string | null;
  readonly stitch: string | null;
}

export interface InkChoice {
  readonly index: number;
  readonly text: string;
}

export type InkVariableValue = number | string | boolean;

export interface InkVariable {
  readonly name: string;
  readonly value: InkVariableValue;
}

export interface InkFault {
  readonly line: number | null;
  readonly message: string;
}

export type InkStepResult =
  | { readonly ok: true; readonly passages: readonly InkPassage[] }
  | ({ readonly ok: false } & InkFault);

export type InkActionResult =
  { readonly ok: true } | ({ readonly ok: false } & InkFault);

export interface InkStory {
  proceed(): InkStepResult;
  choices(): readonly InkChoice[];
  choose(index: number): InkActionResult;
  goTo(knot: string): InkActionResult;
  variables(): readonly InkVariable[];
  setVariable(name: string, value: InkVariableValue): InkActionResult;
  save(): string;
  restore(saved: string): InkActionResult;
  readonly ended: boolean;
  readonly fault: InkFault | null;
}

const NUMERIC_SEGMENT = /^\d+$/;
const RUNTIME_LINE = new RegExp(
  "^RUNTIME (?:ERROR|WARNING): (?:'[^']*' )?line (\\d+): (.*)$",
);
const ANY_LINE = /line (\d+): (.*)$/;

function parsePlace(path: string | null): {
  knot: string | null;
  stitch: string | null;
} {
  if (path === null || path === "") return { knot: null, stitch: null };
  const named: string[] = [];
  for (const segment of path.split(".")) {
    if (segment === "" || NUMERIC_SEGMENT.test(segment)) break;
    if (segment.startsWith("c-") || segment.startsWith("g-")) break;
    named.push(segment);
    if (named.length === 2) break;
  }
  return { knot: named[0] ?? null, stitch: named[1] ?? null };
}

// Reads the first non-whitespace StringValue in outputStream with debugMetadata, avoiding currentDebugMetadata's +1 lookahead.
function outputStreamLine(story: Story): number | null {
  for (const obj of story.state.outputStream) {
    const val: unknown = Reflect.get(obj, "value");
    if (
      typeof val === "string" &&
      val.trim().length > 0 &&
      obj.debugMetadata !== null
    ) {
      return obj.debugMetadata.startLineNumber;
    }
  }
  return story.currentDebugMetadata?.startLineNumber ?? null;
}

function parseRuntimeFault(raw: string, fallbackLine: number | null): InkFault {
  const match = RUNTIME_LINE.exec(raw) ?? ANY_LINE.exec(raw);
  if (match !== null) {
    return { line: Number(match[1]), message: match[2]! };
  }
  return {
    line: fallbackLine,
    message: raw.replace(/^RUNTIME (?:ERROR|WARNING): /, ""),
  };
}

function faultFromThrown(
  cause: unknown,
  fallbackLine: number | null,
): InkFault {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return parseRuntimeFault(raw, fallbackLine);
}

function buildStory(
  options: { readonly source: string } | { readonly json: string },
):
  | { readonly story: Story; readonly fault: null }
  | {
      readonly story: null;
      readonly fault: InkFault;
    } {
  if ("source" in options) {
    const compiler = new Compiler(options.source);
    try {
      const compiled = compiler.Compile();
      if (compiler.errors.length > 0) {
        const first = parseInkDiagnostic(compiler.errors[0]!, "error");
        return {
          story: null,
          fault: { line: first.line, message: first.message },
        };
      }
      return { story: compiled, fault: null };
    } catch (cause) {
      const firstRaw = compiler.errors[0];
      if (firstRaw !== undefined) {
        const first = parseInkDiagnostic(firstRaw, "error");
        return {
          story: null,
          fault: { line: first.line, message: first.message },
        };
      }
      return { story: null, fault: faultFromThrown(cause, 1) };
    }
  }
  try {
    return { story: new Story(options.json), fault: null };
  } catch (cause) {
    return { story: null, fault: faultFromThrown(cause, null) };
  }
}

function isVariableValue(value: unknown): value is InkVariableValue {
  return (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

function faultedStory(initial: InkFault): InkStory {
  const fail: InkActionResult = { ok: false, ...initial };
  return {
    proceed: () => fail,
    choices: () => [],
    choose: () => fail,
    goTo: () => fail,
    variables: () => [],
    setVariable: () => fail,
    save: () => "",
    restore: () => fail,
    ended: true,
    fault: initial,
  };
}

/** Creates an Ink story from live source (keeping 1-based source line numbers) or compiled JSON, never throwing raw inkjs errors. */
export function createInkStory(
  options: { readonly source: string } | { readonly json: string },
): InkStory {
  const built = buildStory(options);
  if (built.story === null) return faultedStory(built.fault);
  const { story } = built;
  let activeFault: InkFault | null = null;
  const currentFault = (): InkFault | null => activeFault;
  story.onError = (message: string, errorType: number) => {
    // ErrorType.Warning is 1; only runtime errors stop playback
    if (errorType === 1) return;
    const metaLine = story.currentDebugMetadata?.startLineNumber ?? null;
    activeFault = parseRuntimeFault(message, metaLine);
  };

  function runAction(fn: () => void): InkActionResult {
    activeFault = null;
    try {
      fn();
    } catch (cause) {
      const metaLine = story.currentDebugMetadata?.startLineNumber ?? null;
      activeFault ??= faultFromThrown(cause, metaLine);
    }
    const fault = currentFault();
    return fault === null ? { ok: true } : { ok: false, ...fault };
  }

  return {
    proceed(): InkStepResult {
      activeFault = null;
      const passages: InkPassage[] = [];
      while (story.canContinue) {
        let raw: string | null = null;
        try {
          raw = story.Continue();
        } catch (cause) {
          const metaLine = story.currentDebugMetadata?.startLineNumber ?? null;
          activeFault ??= faultFromThrown(cause, metaLine);
          return { ok: false, ...activeFault };
        }
        const fault = currentFault();
        if (fault !== null) return { ok: false, ...fault };
        if (raw === null) continue;
        const text = raw.replace(/\r?\n$/, "");
        if (text.trim() === "") continue;
        const { knot, stitch } = parsePlace(story.state.previousPathString);
        passages.push({
          text,
          line: outputStreamLine(story),
          knot,
          stitch,
        });
      }
      const fault = currentFault();
      if (fault !== null) return { ok: false, ...fault };
      return { ok: true, passages };
    },

    choices(): readonly InkChoice[] {
      return story.currentChoices.map((choice) => ({
        index: choice.index,
        text: choice.text,
      }));
    },

    choose(index: number): InkActionResult {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= story.currentChoices.length
      ) {
        activeFault = { line: null, message: "choice index out of range" };
        return { ok: false, ...activeFault };
      }
      return runAction(() => {
        story.ChooseChoiceIndex(index);
      });
    },

    goTo(knot: string): InkActionResult {
      return runAction(() => {
        story.ChoosePathString(knot);
      });
    },

    variables(): readonly InkVariable[] {
      const list: InkVariable[] = [];
      for (const name of Object.keys(story.variablesState)) {
        const value: unknown = story.variablesState.$(name);
        if (isVariableValue(value)) list.push({ name, value });
      }
      return list;
    },

    setVariable(name: string, value: InkVariableValue): InkActionResult {
      if (!story.variablesState.GlobalVariableExistsWithName(name)) {
        activeFault = { line: null, message: `unknown variable '${name}'` };
        return { ok: false, ...activeFault };
      }
      return runAction(() => {
        story.variablesState.$(name, value);
      });
    },

    save(): string {
      return story.state.ToJson();
    },

    restore(saved: string): InkActionResult {
      return runAction(() => {
        story.state.LoadJson(saved);
      });
    },

    get ended(): boolean {
      return (
        activeFault !== null ||
        (!story.canContinue && story.currentChoices.length === 0)
      );
    },

    get fault(): InkFault | null {
      return activeFault;
    },
  };
}
