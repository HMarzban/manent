// Classic browser Web Worker hosting Ink compilation and live InkStory runtime (preserving 1-based line numbers).
import { compileInk, createInkStory } from "@manent/formats";
import type {
  InkActionResult,
  InkChoice,
  InkCompiled,
  InkFault,
  InkStepResult,
  InkStory,
  InkVariable,
  InkVariableValue,
} from "@manent/formats";

export type InkWorkerRequest =
  | { readonly id: number; readonly kind: "compile"; readonly source: string }
  | { readonly id: number; readonly kind: "restart" }
  | { readonly id: number; readonly kind: "proceed" }
  | { readonly id: number; readonly kind: "choices" }
  | { readonly id: number; readonly kind: "choose"; readonly index: number }
  | { readonly id: number; readonly kind: "goTo"; readonly knot: string }
  | { readonly id: number; readonly kind: "variables" }
  | {
      readonly id: number;
      readonly kind: "setVariable";
      readonly name: string;
      readonly value: InkVariableValue;
    }
  | { readonly id: number; readonly kind: "save" }
  | { readonly id: number; readonly kind: "restore"; readonly saved: string };

export type InkWorkerResponse =
  | {
      readonly id: number;
      readonly kind: "compiled";
      readonly compiled: InkCompiled;
      readonly version?: number;
    }
  | {
      readonly id: number;
      readonly kind: "step";
      readonly result: InkStepResult;
      readonly choices: readonly InkChoice[];
      readonly variables: readonly InkVariable[];
      readonly ended: boolean;
      readonly fault: InkFault | null;
    }
  | {
      readonly id: number;
      readonly kind: "choices";
      readonly choices: readonly InkChoice[];
      readonly ended: boolean;
      readonly fault: InkFault | null;
    }
  | {
      readonly id: number;
      readonly kind: "variables";
      readonly variables: readonly InkVariable[];
    }
  | {
      readonly id: number;
      readonly kind: "action";
      readonly result: InkActionResult;
    }
  | {
      readonly id: number;
      readonly kind: "saved";
      readonly saved: string | null;
    }
  | {
      readonly id: number;
      readonly kind: "fault";
      readonly message: string;
    };

const NO_STORY_FAULT: InkFault = Object.freeze({
  line: null,
  message: "Story has not compiled yet.",
});

function toFaultMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** Creates an isolated Ink compile + live-story request handler (one per worker or fallback client). */
export function createInkWorkerHandler(): (
  req: InkWorkerRequest,
) => InkWorkerResponse {
  let compiledSource: string | null = null;
  let compiledVersion = 0;
  let activeStory: InkStory | null = null;

  return function handleRequest(req: InkWorkerRequest): InkWorkerResponse {
    try {
      switch (req.kind) {
        case "compile": {
          const compiled = compileInk(req.source);
          if (compiled.ok) {
            compiledSource = req.source;
            compiledVersion += 1;
          }
          return {
            id: req.id,
            kind: "compiled",
            compiled,
            version: compiledVersion,
          };
        }
        case "restart": {
          if (compiledSource === null) {
            return {
              id: req.id,
              kind: "action",
              result: { ok: false, ...NO_STORY_FAULT },
            };
          }
          activeStory = createInkStory({ source: compiledSource });
          const result: InkActionResult =
            activeStory.fault === null
              ? { ok: true }
              : { ok: false, ...activeStory.fault };
          return { id: req.id, kind: "action", result };
        }
        case "proceed": {
          if (activeStory === null) {
            return {
              id: req.id,
              kind: "step",
              result: { ok: false, ...NO_STORY_FAULT },
              choices: [],
              variables: [],
              ended: true,
              fault: NO_STORY_FAULT,
            };
          }
          const result = activeStory.proceed();
          return {
            id: req.id,
            kind: "step",
            result,
            choices: activeStory.choices(),
            variables: activeStory.variables(),
            ended: activeStory.ended,
            fault: activeStory.fault,
          };
        }
        case "choices":
          return {
            id: req.id,
            kind: "choices",
            choices: activeStory?.choices() ?? [],
            ended: activeStory?.ended ?? true,
            fault: activeStory?.fault ?? null,
          };
        case "choose":
          return {
            id: req.id,
            kind: "action",
            result:
              activeStory === null
                ? { ok: false, ...NO_STORY_FAULT }
                : activeStory.choose(req.index),
          };
        case "goTo":
          return {
            id: req.id,
            kind: "action",
            result:
              activeStory === null
                ? { ok: false, ...NO_STORY_FAULT }
                : activeStory.goTo(req.knot),
          };
        case "variables":
          return {
            id: req.id,
            kind: "variables",
            variables: activeStory?.variables() ?? [],
          };
        case "setVariable":
          return {
            id: req.id,
            kind: "action",
            result:
              activeStory === null
                ? { ok: false, ...NO_STORY_FAULT }
                : activeStory.setVariable(req.name, req.value),
          };
        case "save":
          return {
            id: req.id,
            kind: "saved",
            saved: activeStory === null ? null : activeStory.save(),
          };
        case "restore":
          return {
            id: req.id,
            kind: "action",
            result:
              activeStory === null
                ? { ok: false, ...NO_STORY_FAULT }
                : activeStory.restore(req.saved),
          };
      }
    } catch (thrown) {
      return {
        id: req.id,
        kind: "fault",
        message: toFaultMessage(thrown),
      };
    }
  };
}

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<InkWorkerRequest>) => void,
  ): void;
  postMessage(message: InkWorkerResponse, transfer?: Transferable[]): void;
}

const isDedicatedWorker =
  typeof globalThis === "object" &&
  "importScripts" in globalThis &&
  typeof (globalThis as { importScripts?: unknown }).importScripts ===
    "function";

if (isDedicatedWorker) {
  const workerScope = globalThis as unknown as WorkerScope;
  const handleRequest = createInkWorkerHandler();
  workerScope.addEventListener("message", (event) => {
    try {
      workerScope.postMessage(handleRequest(event.data), []);
    } catch (thrown) {
      const raw = event.data as { id?: unknown } | null | undefined;
      const id = typeof raw?.id === "number" ? raw.id : -1;
      workerScope.postMessage(
        { id, kind: "fault", message: toFaultMessage(thrown) },
        [],
      );
    }
  });
}
