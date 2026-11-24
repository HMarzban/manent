// What each script's editor session shows, those waiting for it to bind a target, and hand-in holds.
import type { Subscribable } from "@manent/ui";

/**
 * How an editor session's open of a target ended: `bound` once it shows it; `offline` or `refused` when it gave it up,
 * the link gone or the server refusing it first; `moved` when the target moved on before.
 */
export type TargetOutcome = "bound" | "offline" | "refused" | "moved";

export type GivenUp = Extract<TargetOutcome, "offline" | "refused">;

/** What a script's editor session shows: the target it has bound, and the one it is opening, null while none is. */
interface Binding {
  bound: string;
  opening: string | null;
}

interface TargetState {
  known: boolean;
  target: string;
  keptPrivate: boolean;
  hasCopy: boolean;
}

interface TargetBindingsDeps {
  stateOf(docId: string): TargetState;
  followChanges(docId: string, listener: () => void): () => void;
  rollBack(docId: string): boolean;
  addListener(listener: () => void): () => void;
  tell(): void;
}

interface TargetBindings {
  followTarget(
    docId: string,
    opened: string,
    open: (target: string, wanted: () => boolean) => Promise<TargetOutcome>,
  ): () => void;
  boundTarget(docId: string): Subscribable<string | null>;
  whenBound(docId: string, target: string): Promise<TargetOutcome>;
  isWritable(docId: string): boolean;
  onGivenUp(docId: string, listener: (outcome: GivenUp) => void): () => void;
  holdInput(docId: string): () => void;
  settleMoved(): void;
}

export function createTargetBindings(deps: TargetBindingsDeps): TargetBindings {
  // by room docId: what its editor session shows, published by the session
  const bindings = new Map<string, Binding>();
  // by room docId: those waiting for the session to bind a target, or give it up
  const settling = new Map<
    string,
    Set<{ target: string; settle(outcome: TargetOutcome): void }>
  >();
  // by room docId: the hand-ins that hold the editor read-only
  const holds = new Map<string, number>();
  // by room docId: those told when its session gives up a private copy this tab did not move to
  const givingUp = new Map<string, Set<(outcome: GivenUp) => void>>();

  const settle = (
    docId: string,
    target: string,
    outcome: TargetOutcome,
  ): void => {
    const waiters = settling.get(docId);
    if (waiters === undefined) return;
    for (const waiting of waiters) {
      if (waiting.target !== target) continue;
      waiters.delete(waiting);
      waiting.settle(outcome);
    }
    if (waiters.size === 0) settling.delete(docId);
  };

  const settleExcept = (docId: string, active: string): void => {
    const waiters = settling.get(docId);
    if (waiters === undefined) return;
    for (const waiting of waiters) {
      if (waiting.target === active) continue;
      waiters.delete(waiting);
      waiting.settle("moved");
    }
    if (waiters.size === 0) settling.delete(docId);
  };

  const waitSettling = (
    docId: string,
    target: string,
  ): Promise<TargetOutcome> =>
    new Promise((resolve) => {
      const waiting = settling.get(docId) ?? new Set();
      settling.set(docId, waiting);
      waiting.add({ target, settle: resolve });
    });

  return {
    followTarget(docId, opened, open) {
      const binding: Binding = { bound: opened, opening: null };
      let stopped = false;
      const leave = (): void => {
        const left = binding.opening;
        binding.opening = null;
        if (left !== null) settle(docId, left, "moved");
      };
      const check = (): void => {
        const { target } = deps.stateOf(docId);
        if (stopped || target === binding.opening) return;
        leave();
        if (target === binding.bound) {
          settleExcept(docId, target);
          return;
        }
        binding.opening = target;
        const wanted = (): boolean => !stopped && binding.opening === target;
        void open(target, wanted).then((outcome) => {
          if (!wanted()) return;
          binding.opening = null;
          settle(docId, target, outcome);
          // a target given up is asked again on the next change, never at once: it would fail again the same way
          if (outcome === "bound") {
            binding.bound = target;
            deps.tell();
          } else if (
            outcome !== "moved" &&
            !deps.rollBack(docId) &&
            target !== docId
          )
            for (const listener of givingUp.get(docId) ?? []) listener(outcome);
        });
      };
      bindings.set(docId, binding);
      settle(docId, opened, "bound");
      const stop = deps.followChanges(docId, check);
      // the target may have moved while `opened` was opening
      check();
      deps.tell();
      return () => {
        stopped = true;
        stop();
        leave();
        if (bindings.get(docId) === binding) {
          bindings.delete(docId);
          const waiters = settling.get(docId);
          if (waiters !== undefined) {
            for (const waiting of waiters) waiting.settle("moved");
            settling.delete(docId);
          }
        }
        deps.tell();
      };
    },
    boundTarget: (docId) => ({
      get: () => bindings.get(docId)?.bound ?? null,
      subscribe: (listener) =>
        deps.addListener(() => listener(bindings.get(docId)?.bound ?? null)),
    }),
    whenBound(docId, target) {
      const binding = bindings.get(docId);
      if (binding === undefined) {
        if (deps.stateOf(docId).target !== target)
          return Promise.resolve("moved");
        return waitSettling(docId, target);
      }
      if (binding.bound === target) return Promise.resolve("bound");
      if (binding.opening !== target) return Promise.resolve("moved");
      return waitSettling(docId, target);
    },
    isWritable(docId) {
      if ((holds.get(docId) ?? 0) > 0) return false;
      const { known, target, keptPrivate, hasCopy } = deps.stateOf(docId);
      if (!known) return false;
      if (keptPrivate && !hasCopy) return false;
      const binding = bindings.get(docId);
      if (binding === undefined) return !keptPrivate && target === docId;
      return binding.bound === target;
    },
    onGivenUp(docId, listener) {
      const heard = givingUp.get(docId) ?? new Set();
      givingUp.set(docId, heard);
      heard.add(listener);
      return () => {
        heard.delete(listener);
        if (heard.size === 0 && givingUp.get(docId) === heard)
          givingUp.delete(docId);
      };
    },
    holdInput(docId) {
      holds.set(docId, (holds.get(docId) ?? 0) + 1);
      deps.tell();
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        const next = (holds.get(docId) ?? 1) - 1;
        if (next <= 0) holds.delete(docId);
        else holds.set(docId, next);
        deps.tell();
      };
    },
    settleMoved() {
      for (const docId of settling.keys()) {
        if (bindings.get(docId) !== undefined) continue;
        settleExcept(docId, deps.stateOf(docId).target);
      }
    },
  };
}
