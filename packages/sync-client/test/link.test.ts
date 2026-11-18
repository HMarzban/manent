import { expect, test } from "bun:test";
import type { ServerVersions, VersionSet } from "@manent/sync-protocol";
import fc from "fast-check";
import {
  BACKOFF_CAP_MS,
  INITIAL_LINK,
  backoffDelayMs,
  gateServer,
  linkStep,
} from "../src/index.ts";
import type {
  LinkEffect,
  LinkInput,
  LinkModel,
  LinkState,
} from "../src/index.ts";

const LINK_STATES: readonly LinkState[] = [
  "offline",
  "connecting",
  "authenticating",
  "online",
];

const EFFECT_TYPES: readonly LinkEffect["type"][] = [
  "connect",
  "hello",
  "close",
  "retry_in",
  "cancel_retry",
  "online",
  "dropped",
  "probe",
];

function run(
  model: LinkModel,
  inputs: readonly LinkInput[],
): { model: LinkModel; effects: LinkEffect[] }[] {
  const steps: { model: LinkModel; effects: LinkEffect[] }[] = [];
  let current = model;
  for (const input of inputs) {
    const step = linkStep(current, input);
    steps.push(step);
    current = step.model;
  }
  return steps;
}

test("backoff is full jitter under a cap of 30 s", () => {
  expect([0, 1, 2, 5, 6, 20].map((a) => backoffDelayMs(a, 0.999999))).toEqual([
    499, 999, 1999, 15999, 29999, 29999,
  ]);
  expect(backoffDelayMs(9, 0)).toBe(0);
  expect(() => backoffDelayMs(-1, 0.5)).toThrow(RangeError);
  expect(() => backoffDelayMs(0, 1)).toThrow(RangeError);
});

test("offline → connecting → authenticating → online", () => {
  const steps = run(INITIAL_LINK, [
    { type: "want", online: true },
    { type: "opened" },
    { type: "welcome", gate: "ok" },
  ]);
  expect(steps.map((s) => s.model.state)).toEqual([
    "connecting",
    "authenticating",
    "online",
  ]);
  expect(steps.flatMap((s) => s.effects.map((e) => e.type))).toEqual([
    "cancel_retry",
    "connect",
    "hello",
    "online",
  ]);
});

test("each close code has its own answer", () => {
  const online: LinkModel = {
    state: "online",
    issue: "none",
    wanted: true,
    attempt: 3,
  };
  expect(linkStep(online, { type: "closed", code: 4401, random: 0.5 })).toEqual(
    {
      model: { ...online, state: "offline", issue: "sign_in" },
      effects: [{ type: "dropped" }],
    },
  );
  expect(
    linkStep(online, { type: "closed", code: 4408, random: 0.5 }).model.issue,
  ).toBe("too_old");
  expect(
    linkStep(online, { type: "closed", code: 1012, random: 0.5 }).effects,
  ).toEqual([{ type: "dropped" }, { type: "retry_in", delayMs: 2500 }]);
  for (const code of [1006, 1000, 1009, 1011, 4400, 4429])
    expect(linkStep(online, { type: "closed", code, random: 0.5 })).toEqual({
      model: { ...online, state: "offline", attempt: 4 },
      effects: [{ type: "dropped" }, { type: "retry_in", delayMs: 2000 }],
    });
});

test("a failed sign-in waits for the person, and a retry asks again", () => {
  const connecting: LinkModel = {
    state: "connecting",
    issue: "none",
    wanted: true,
    attempt: 2,
  };
  const [failed, retried, fired, , answered] = run(connecting, [
    { type: "connect_failed", code: "sign_in", random: 0.5 },
    { type: "retry_now", random: 0.5 },
    { type: "timer" },
    { type: "opened" },
    { type: "welcome", gate: "ok" },
  ]);
  const waiting: LinkModel = {
    ...connecting,
    state: "offline",
    issue: "sign_in",
  };
  expect([failed, retried, fired]).toEqual([
    { model: waiting, effects: [] },
    {
      model: waiting,
      effects: [{ type: "cancel_retry" }, { type: "retry_in", delayMs: 500 }],
    },
    {
      model: { ...waiting, state: "connecting" },
      effects: [{ type: "connect" }],
    },
  ]);
  expect(answered?.model).toEqual({ ...connecting, state: "online" });
});

test("ten seconds online forgets the failures", () => {
  const online: LinkModel = {
    state: "online",
    issue: "none",
    wanted: true,
    attempt: 5,
  };
  expect(linkStep(online, { type: "stable" })).toEqual({
    model: { ...online, attempt: 0 },
    effects: [],
  });
});

test("going offline on purpose closes and stays closed", () => {
  const online: LinkModel = {
    state: "online",
    issue: "none",
    wanted: true,
    attempt: 1,
  };
  const closed: LinkModel = { ...online, state: "offline", wanted: false };
  expect(
    run(online, [
      { type: "want", online: false },
      { type: "timer" },
      { type: "retry_now", random: 0.5 },
    ]),
  ).toEqual([
    {
      model: closed,
      effects: [
        { type: "cancel_retry" },
        { type: "close", code: 1000, reason: "offline" },
        { type: "dropped" },
      ],
    },
    { model: closed, effects: [] },
    { model: closed, effects: [] },
  ]);
});

test("a server older than this build can work with is left alone", () => {
  const auth: LinkModel = {
    state: "authenticating",
    issue: "none",
    wanted: true,
    attempt: 0,
  };
  expect(linkStep(auth, { type: "welcome", gate: "too_old" })).toEqual({
    model: { ...auth, state: "offline", issue: "server_old" },
    effects: [
      { type: "close", code: 1000, reason: "server_old" },
      { type: "dropped" },
    ],
  });
});

function v(
  protocol: number,
  schema: number,
  engine: number,
  table: number,
): VersionSet {
  return { protocol, schema, engine, table };
}

function server(current: VersionSet): ServerVersions {
  return { current, min: v(1, 1, 0, 0) };
}

test("the gate reads the versions WELCOME carries", () => {
  expect(gateServer(v(1, 1, 0, 0), v(1, 1, 0, 0), server(v(1, 1, 0, 0)))).toBe(
    "ok",
  );
  // this build writes a newer schema than the server knows
  expect(gateServer(v(1, 2, 0, 0), v(1, 1, 0, 0), server(v(1, 1, 0, 0)))).toBe(
    "limited",
  );
  // the server's protocol is below what this build needs
  expect(gateServer(v(2, 2, 0, 0), v(2, 1, 0, 0), server(v(1, 3, 0, 0)))).toBe(
    "too_old",
  );
  // a newer engine or table changes nothing here
  expect(gateServer(v(1, 1, 3, 3), v(1, 1, 0, 0), server(v(1, 1, 0, 0)))).toBe(
    "ok",
  );
});

test("a delay never comes from the clock", () => {
  fc.assert(
    fc.property(
      fc.nat(40),
      fc.double({ min: 0, max: 0.999999, noNaN: true }),
      (attempt, random) => {
        const d = backoffDelayMs(attempt, random);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(BACKOFF_CAP_MS);
        expect(Number.isInteger(d)).toBe(true);
      },
    ),
    { numRuns: 1000 },
  );
  // model and input only: there is no clock to read
  expect(linkStep.length).toBe(2);
});

const arbRandom = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

const arbModel: fc.Arbitrary<LinkModel> = fc.record({
  state: fc.constantFrom(...LINK_STATES),
  issue: fc.constantFrom("none", "sign_in", "too_old", "server_old"),
  wanted: fc.boolean(),
  attempt: fc.nat(2000),
});

const arbInput: fc.Arbitrary<LinkInput> = fc.oneof(
  fc.record({ type: fc.constant("want"), online: fc.boolean() }),
  fc.record({ type: fc.constant("retry_now"), random: arbRandom }),
  fc.record({ type: fc.constant("timer") }),
  fc.record({ type: fc.constant("opened") }),
  fc.record({
    type: fc.constant("connect_failed"),
    code: fc.constantFrom("unreachable", "sign_in"),
    random: arbRandom,
  }),
  fc.record({
    type: fc.constant("welcome"),
    gate: fc.constantFrom("ok", "limited", "too_old"),
  }),
  fc.record({ type: fc.constant("welcome_timeout"), random: arbRandom }),
  fc.record({
    type: fc.constant("closed"),
    code: fc.oneof(
      fc.constantFrom(1000, 1006, 1011, 1012, 4400, 4401, 4408, 4429),
      fc.integer({ min: 0, max: 65_535 }),
    ),
    random: arbRandom,
  }),
  fc.record({ type: fc.constant("stable") }),
);

test("every state answers every input without throwing", () => {
  fc.assert(
    fc.property(arbModel, arbInput, (model, input) => {
      const { model: next, effects } = linkStep(model, input);
      expect(LINK_STATES).toContain(next.state);
      expect(Array.isArray(effects)).toBe(true);
      for (const effect of effects) expect(EFFECT_TYPES).toContain(effect.type);
    }),
    { numRuns: 5000 },
  );
});
