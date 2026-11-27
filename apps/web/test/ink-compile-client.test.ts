import { afterEach, describe, expect, test } from "bun:test";
import {
  createInkCompileClient,
  createWorkerTransport,
} from "../src/ink/compile-client.ts";
import type { InkRpcTransport } from "../src/ink/compile-client.ts";
import { createInkWorkerHandler } from "../src/ink/compile.worker.ts";
import type {
  InkWorkerRequest,
  InkWorkerResponse,
} from "../src/ink/compile.worker.ts";
import { replayStory } from "../src/ink/player/replay.ts";

class FakeWorker {
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly posted: InkWorkerRequest[] = [];
  terminated = false;
  onPost: ((req: InkWorkerRequest, worker: FakeWorker) => void) | null = null;

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  postMessage(req: InkWorkerRequest): void {
    this.posted.push(req);
    this.onPost?.(req, this);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  terminate(): void {
    this.terminated = true;
  }
}

const disposables: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposables.splice(0)) dispose();
});

describe("Ink Web Worker reliability & serialization", () => {
  test("worker crash terminates dead worker, enters stopped state, refuses auto-spin, and respawns on restartWorker", async () => {
    const workers: FakeWorker[] = [];
    const client = createInkCompileClient({
      debounceMs: 10,
      createTransport: () =>
        createWorkerTransport({
          timeoutMs: 200,
          createWorker: () => {
            const w = new FakeWorker();
            workers.push(w);
            const handler = createInkWorkerHandler();
            if (workers.length === 1) {
              w.onPost = () => {
                queueMicrotask(() => w.emit("error", { message: "boom" }));
              };
            } else {
              w.onPost = (req) => {
                queueMicrotask(() => w.emit("message", { data: handler(req) }));
              };
            }
            return w as unknown as Worker;
          },
        }),
    });
    disposables.push(() => client.dispose());

    const first = await client.compileNow("Hello world");
    expect(first.ok).toBe(false);
    expect(workers.length).toBe(1);
    expect(workers[0]!.terminated).toBe(true);
    expect(client.snapshot().state).toBe("stopped");

    // Scheduling a debounced compile while stopped must NOT auto-spin or spawn a new worker.
    client.scheduleCompile(() => "Hello edited");
    await new Promise((r) => setTimeout(r, 30));
    expect(workers.length).toBe(1);
    expect(client.snapshot().state).toBe("stopped");

    // Restarting spawns a fresh worker and recompiles the latest source from scheduleCompile.
    const recovered = await client.restartWorker();
    expect(workers.length).toBe(2);
    expect(recovered?.ok).toBe(true);
    expect(client.snapshot().state).toBe("up_to_date");
    expect(client.snapshot().version).toBe(1);
  });

  test("per-RPC timeout terminates hung worker cleanly and restartWorker recovers", async () => {
    const workers: FakeWorker[] = [];
    const client = createInkCompileClient({
      createTransport: () =>
        createWorkerTransport({
          timeoutMs: 25,
          createWorker: () => {
            const w = new FakeWorker();
            workers.push(w);
            const handler = createInkWorkerHandler();
            if (workers.length === 1) {
              // Deliberately never respond.
              w.onPost = () => {};
            } else {
              w.onPost = (req) => {
                queueMicrotask(() => w.emit("message", { data: handler(req) }));
              };
            }
            return w as unknown as Worker;
          },
        }),
    });
    disposables.push(() => client.dispose());

    const timedOut = await client.compileNow("Hang please");
    expect(timedOut.ok).toBe(false);
    expect(workers[0]!.terminated).toBe(true);
    expect(client.snapshot().state).toBe("stopped");

    const recovered = await client.restartWorker();
    expect(workers.length).toBe(2);
    expect(recovered?.ok).toBe(true);
    expect(client.snapshot().state).toBe("up_to_date");
  });

  test("messageerror terminates worker, stops posting to dead worker, and fresh compileNow respawns", async () => {
    const workers: FakeWorker[] = [];
    const client = createInkCompileClient({
      createTransport: () =>
        createWorkerTransport({
          timeoutMs: 200,
          createWorker: () => {
            const w = new FakeWorker();
            workers.push(w);
            const handler = createInkWorkerHandler();
            if (workers.length === 1) {
              w.onPost = () => {
                queueMicrotask(() => w.emit("messageerror", {}));
              };
            } else {
              w.onPost = (req) => {
                queueMicrotask(() => w.emit("message", { data: handler(req) }));
              };
            }
            return w as unknown as Worker;
          },
        }),
    });
    disposables.push(() => client.dispose());

    const failed = await client.compileNow("First");
    expect(failed.ok).toBe(false);
    expect(workers[0]!.terminated).toBe(true);
    expect(client.snapshot().state).toBe("stopped");

    // Calling an RPC while stopped rejects without posting to the dead worker.
    const postedBefore = workers[0]!.posted.length;
    await expect(client.proceed()).rejects.toThrow();
    expect(workers[0]!.posted.length).toBe(postedBefore);

    // Fresh explicit compileNow respawns cleanly.
    const compiled = await client.compileNow("Fresh script");
    expect(workers.length).toBe(2);
    expect(compiled.ok).toBe(true);
    expect(client.snapshot().state).toBe("up_to_date");
  });

  test("compileNow while inFlight queues and resolves with the follow-up compile result", async () => {
    const handler = createInkWorkerHandler();
    const sentSources: string[] = [];
    const resolvers: (() => void)[] = [];

    const transport: InkRpcTransport = {
      send(req) {
        if (req.kind === "compile") sentSources.push(req.source);
        return new Promise<InkWorkerResponse>((resolve) => {
          resolvers.push(() => resolve(handler(req)));
        });
      },
      close() {},
    };

    const client = createInkCompileClient({ createTransport: () => transport });
    disposables.push(() => client.dispose());

    const p1 = client.compileNow("-> missing_first");
    let p2Settled = false;
    const p2 = client.compileNow("Valid second").then((res) => {
      p2Settled = true;
      return res;
    });
    // Coalescing a third compile while #1 is in flight supersedes #2 so only #3 runs as the single follow-up.
    const p3 = client.compileNow("Valid third");

    await Promise.resolve();
    expect(p2Settled).toBe(false);
    expect(sentSources).toEqual(["-> missing_first"]);

    // Finish compile #1.
    resolvers.shift()!();
    const r1 = await p1;
    expect(r1.ok).toBe(false);
    expect(r1.problems.length).toBeGreaterThan(0);

    // Now follow-up compile ("Valid third") is in flight; p2 must still not have resolved with stale r1.
    await Promise.resolve();
    expect(sentSources).toEqual(["-> missing_first", "Valid third"]);
    expect(p2Settled).toBe(false);

    // Finish follow-up compile.
    resolvers.shift()!();
    const [r2, r3] = await Promise.all([p2, p3]);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(client.snapshot().state).toBe("up_to_date");
    expect(client.snapshot().problems).toEqual([]);
  });

  test("compile-vs-step isolation: debounced compile never clobbers activeStory mid-playthrough", async () => {
    const handler = createInkWorkerHandler();
    const v1 = [
      "Opening line.",
      "* [Left] Left room.",
      "* [Right] Right room.",
    ].join("\n");
    const v2 = "Totally replaced script.";

    const c1 = handler({ id: 1, kind: "compile", source: v1 });
    expect(c1.kind).toBe("compiled");
    expect(c1.kind === "compiled" && c1.compiled.ok).toBe(true);

    const started = handler({ id: 2, kind: "restart" });
    expect(started.kind === "action" && started.result.ok).toBe(true);

    const step1 = handler({ id: 3, kind: "proceed" });
    expect(step1.kind).toBe("step");
    expect(step1.kind === "step" && step1.choices.map((c) => c.text)).toEqual([
      "Left",
      "Right",
    ]);

    // A background compile of v2 arrives before the player picks their choice.
    const c2 = handler({ id: 4, kind: "compile", source: v2 });
    expect(c2.kind === "compiled" && c2.compiled.ok).toBe(true);

    // activeStory is still v1, so choose(1) + proceed() finishes v1 deterministically.
    const chosen = handler({ id: 5, kind: "choose", index: 1 });
    expect(chosen.kind === "action" && chosen.result.ok).toBe(true);
    const step2 = handler({ id: 6, kind: "proceed" });
    expect(step2.kind).toBe("step");
    if (step2.kind === "step" && step2.result.ok) {
      expect(step2.result.passages.map((p) => p.text)).toEqual(["Right room."]);
    }

    // Explicit restart picks up v2.
    const restarted = handler({ id: 7, kind: "restart" });
    expect(restarted.kind === "action" && restarted.result.ok).toBe(true);
    const v2Step = handler({ id: 8, kind: "proceed" });
    expect(v2Step.kind).toBe("step");
    if (v2Step.kind === "step" && v2Step.result.ok) {
      expect(v2Step.result.passages.map((p) => p.text)).toEqual([
        "Totally replaced script.",
      ]);
    }
  });

  test("duplicate choice labels replay deterministically by index before text fallback", async () => {
    const client = createInkCompileClient();
    disposables.push(() => client.dispose());

    const duplicateStory = [
      "Choose carefully.",
      "* [Wait] First wait branch.",
      "* [Wait] Second wait branch.",
    ].join("\n");
    const compiled = await client.compileNow(duplicateStory);
    expect(compiled.ok).toBe(true);

    // Selecting the second duplicate "Wait" (index 1) replays deterministically into Second wait branch.
    const replaySecond = await replayStory(client, {
      choices: [{ index: 1, text: "Wait" }],
      editedVariables: [],
      startKnot: null,
      isStale: () => false,
    });
    expect(replaySecond).not.toBeNull();
    expect(replaySecond!.diverged).toBe(false);
    expect(
      replaySecond!.transcript
        .filter((item) => item.kind === "passage")
        .map((item) => item.text),
    ).toEqual(["Choose carefully.", "Second wait branch."]);

    // When choices shift so recorded index no longer matches text, fallback matches by text.
    const shiftedStory = [
      "Choose carefully.",
      "* [New option] Added.",
      "* [Stay] Stayed here.",
    ].join("\n");
    expect((await client.compileNow(shiftedStory)).ok).toBe(true);
    const replayShifted = await replayStory(client, {
      choices: [{ index: 0, text: "Stay" }],
      editedVariables: [],
      startKnot: null,
      isStale: () => false,
    });
    expect(replayShifted).not.toBeNull();
    expect(replayShifted!.diverged).toBe(false);
    expect(
      replayShifted!.transcript
        .filter((item) => item.kind === "passage")
        .map((item) => item.text),
    ).toEqual(["Choose carefully.", "Stayed here."]);
  });

  test("worker handler catches uncaught exceptions and returns a structured fault response", () => {
    const handler = createInkWorkerHandler();
    // Passing a malformed request whose source throws when read exercises the try/catch guard.
    const badReq = {
      id: 42,
      kind: "compile" as const,
      get source(): string {
        throw new Error("unreadable source");
      },
    };
    const res = handler(badReq);
    expect(res).toEqual({
      id: 42,
      kind: "fault",
      message: "unreadable source",
    });
  });
});
