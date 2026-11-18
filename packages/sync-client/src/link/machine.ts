// The link to the server as a pure state machine: what each input does in each state, and
// the effects its driver carries out. It reads no clock and draws no chance of its own.
import { CODE } from "@manent/sync-protocol";
import { RESTART_SPREAD_MS, RETRY_NOW_JITTER_MS } from "../ports/defaults.ts";
import type { LinkState } from "../ports/ports.ts";
import { backoffDelayMs } from "./backoff.ts";
import type { ServerGate } from "./gate.ts";

/** Why the link waits offline for something to change; `none` while it retries by itself. */
export type LinkIssue = "none" | "sign_in" | "too_old" | "server_old";

/** `wanted`: the person wants to be online. `attempt`: failures since the link was last stable. */
export interface LinkModel {
  state: LinkState;
  issue: LinkIssue;
  wanted: boolean;
  attempt: number;
}

export const INITIAL_LINK: LinkModel = Object.freeze({
  state: "offline",
  issue: "none",
  wanted: true,
  attempt: 0,
});

/**
 * What the driver tells the machine. Every `random` is in [0, 1). `stable`: the
 * link has been online for STABLE_AFTER_MS.
 */
export type LinkInput =
  | { type: "want"; online: boolean }
  | { type: "retry_now"; random: number }
  | { type: "timer" }
  | { type: "opened" }
  | { type: "connect_failed"; code: "unreachable" | "sign_in"; random: number }
  | { type: "welcome"; gate: ServerGate }
  | { type: "welcome_timeout"; random: number }
  | { type: "closed"; code: number; random: number }
  | { type: "stable" };

/** What the driver does, in order. When a `retry_in` delay has passed, the driver sends `timer`. */
export type LinkEffect =
  | { type: "connect" }
  | { type: "hello" }
  | { type: "close"; code: number; reason: string }
  | { type: "retry_in"; delayMs: number }
  | { type: "cancel_retry" }
  | { type: "online" }
  | { type: "dropped" }
  | { type: "probe" };

interface Step {
  model: LinkModel;
  effects: LinkEffect[];
}

/** The next model and its effects. An input the current state does not expect changes nothing. */
export function linkStep(model: LinkModel, input: LinkInput): Step {
  if (input.type === "want")
    return input.online ? wantOnline(model) : wantOffline(model);
  switch (model.state) {
    case "offline":
      return fromOffline(model, input);
    case "connecting":
      return fromConnecting(model, input);
    case "authenticating":
      return fromAuthenticating(model, input);
    case "online":
      return fromOnline(model, input);
  }
}

type Driven = Exclude<LinkInput, { type: "want" }>;

function still(model: LinkModel): Step {
  return { model, effects: [] };
}

function wantOnline(model: LinkModel): Step {
  if (model.state !== "offline") return still(model);
  return {
    model: { ...model, state: "connecting", issue: "none", wanted: true },
    effects: [{ type: "cancel_retry" }, { type: "connect" }],
  };
}

function wantOffline(model: LinkModel): Step {
  const next: LinkModel = { ...model, state: "offline", wanted: false };
  if (model.state === "offline")
    return { model: next, effects: [{ type: "cancel_retry" }] };
  return {
    model: next,
    effects: [
      { type: "cancel_retry" },
      { type: "close", code: 1000, reason: "offline" },
      { type: "dropped" },
    ],
  };
}

/** Offline, counting one more failure, with a retry after the backoff for the failures before it. */
function backOff(
  model: LinkModel,
  random: number,
  first: readonly LinkEffect[],
): Step {
  return {
    model: { ...model, state: "offline", attempt: model.attempt + 1 },
    effects: [
      ...first,
      { type: "retry_in", delayMs: backoffDelayMs(model.attempt, random) },
    ],
  };
}

function fromOffline(model: LinkModel, input: Driven): Step {
  if (!model.wanted) return still(model);
  if (input.type === "retry_now")
    return {
      model,
      effects: [
        { type: "cancel_retry" },
        {
          type: "retry_in",
          delayMs: Math.floor(input.random * RETRY_NOW_JITTER_MS),
        },
      ],
    };
  if (input.type === "timer")
    return {
      model: { ...model, state: "connecting" },
      effects: [{ type: "connect" }],
    };
  return still(model);
}

function fromConnecting(model: LinkModel, input: Driven): Step {
  if (input.type === "opened")
    return {
      model: { ...model, state: "authenticating" },
      effects: [{ type: "hello" }],
    };
  if (input.type !== "connect_failed") return still(model);
  if (input.code === "sign_in")
    return {
      model: { ...model, state: "offline", issue: "sign_in" },
      effects: [],
    };
  return backOff({ ...model, issue: "none" }, input.random, []);
}

function fromAuthenticating(model: LinkModel, input: Driven): Step {
  if (input.type === "welcome" && input.gate === "too_old")
    return {
      model: { ...model, state: "offline", issue: "server_old" },
      effects: [
        { type: "close", code: 1000, reason: "server_old" },
        { type: "dropped" },
      ],
    };
  if (input.type === "welcome")
    return {
      model: { ...model, state: "online", issue: "none" },
      effects: [{ type: "online" }],
    };
  if (input.type === "welcome_timeout")
    return backOff(model, input.random, [
      { type: "close", code: 1000, reason: "welcome_timeout" },
      { type: "dropped" },
    ]);
  if (input.type === "closed") return closed(model, input);
  return still(model);
}

function fromOnline(model: LinkModel, input: Driven): Step {
  if (input.type === "stable")
    return { model: { ...model, attempt: 0 }, effects: [] };
  if (input.type === "retry_now")
    return { model, effects: [{ type: "probe" }] };
  if (input.type === "closed") return closed(model, input);
  return still(model);
}

/** The server's close code decides whether to retry, and how soon. */
function closed(
  model: LinkModel,
  input: Extract<LinkInput, { type: "closed" }>,
): Step {
  const offline: LinkModel = { ...model, state: "offline" };
  if (input.code === CODE.UNAUTHENTICATED)
    return {
      model: { ...offline, issue: "sign_in" },
      effects: [{ type: "dropped" }],
    };
  if (input.code === CODE.TOO_OLD)
    return {
      model: { ...offline, issue: "too_old" },
      effects: [{ type: "dropped" }],
    };
  if (input.code === CODE.RESTARTING)
    return {
      model: { ...offline, issue: "none" },
      effects: [
        { type: "dropped" },
        {
          type: "retry_in",
          delayMs: Math.floor(input.random * RESTART_SPREAD_MS),
        },
      ],
    };
  return backOff({ ...model, issue: "none" }, input.random, [
    { type: "dropped" },
  ]);
}
