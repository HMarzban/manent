import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  HTTP_ERROR_CODES,
  REPLAY_REFUSALS,
  SERVER_STATES,
  decodeReplayUpdates,
  encodeReplayUpdates,
  isHttpErrorCode,
  isReplayKey,
  isServerState,
  projectHome,
} from "../src/index.ts";
import type {
  CreateDocumentRequest,
  DemoResponse,
  DocClientsResponse,
  MeResponse,
  RemovedDocResponse,
  SignInOptions,
  SignInResponse,
} from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";

test("the server states are a fixed list, and each list's guard refuses what is not on it", () => {
  expect(SERVER_STATES).toEqual(["running", "stopped", "starting", "failed"]);
  expect(["not_found", "nope", 7, null].map(isHttpErrorCode)).toEqual([
    true,
    false,
    false,
    false,
  ]);
  expect(["starting", "sleeping", ["running"]].map(isServerState)).toEqual([
    true,
    false,
    false,
  ]);
});

test("each route body is the shape both sides compile against", () => {
  const me: MeResponse = {
    userId: "leo",
    name: "Leo Marsh",
    workspaces: [{ id: "medium", name: "Writers' room", seeding: null }],
  };
  const signIn: SignInResponse = {
    token: "t",
    user: { userId: "leo", name: "Leo Marsh" },
  };
  const options: SignInOptions = {
    choices: [
      {
        userId: "leo",
        name: "Leo Marsh",
        title: "Executive, reader and commenter",
        registered: true,
      },
    ],
  };
  const demo: DemoResponse = {
    demo: true,
    seedId: null,
    control: { url: "http://127.0.0.1:4748", token: "t" },
  };
  expect([
    Object.keys(me),
    Object.keys(signIn),
    Object.keys(options.choices[0]!),
    Object.keys(demo),
  ]).toEqual([
    ["userId", "name", "workspaces"],
    ["token", "user"],
    ["userId", "name", "title", "registered"],
    ["demo", "seedId", "control"],
  ]);
});

test("the two document information bodies are fixed", () => {
  const clients: DocClientsResponse = {
    clients: [{ clientId: 7, userId: "sam", name: "Sam Okafor" }],
  };
  const removed: RemovedDocResponse = {
    deletedByUserId: "dana",
    deletedByName: "Dana Reyes",
    deletedAt: 1,
  };
  const create: CreateDocumentRequest = {
    docId: DOC,
    kind: "script",
    home: projectHome(DOC2),
    workspaceId: "medium",
  };
  expect([
    Object.keys(clients.clients[0]!),
    Object.keys(removed),
    Object.keys(create),
  ]).toEqual([
    ["clientId", "userId", "name"],
    ["deletedByUserId", "deletedByName", "deletedAt"],
    ["docId", "kind", "home", "workspaceId"],
  ]);
});

test("the error codes are pinned in their order", () => {
  expect(HTTP_ERROR_CODES).toEqual([
    "bad_request",
    "forbidden_host",
    "forbidden_origin",
    "not_found",
    "unauthenticated",
    "unknown_user",
    "deleted",
    "exists_elsewhere",
    "forbidden",
    "unsupported_kind",
    "busy",
    "generation_current",
    "incomplete",
    "invalid",
    "past_window",
    "too_large",
    "unknown_generation",
    "unreachable",
    "not_restorable",
    "already_issued",
    "already_locked",
    "changed",
    "engine_unavailable",
    "not_locked",
    "recall_closed",
    "unknown_label",
    "link_expired",
    "link_revoked",
    "not_member",
    "not_sent",
    "driver_taken",
    "not_driver",
    "already_handed_in",
    "no_private_copy",
    "not_in_rundown",
    "cannot_send",
    "rate_limited",
  ]);
  expect(REPLAY_REFUSALS).toEqual([
    "bad_request",
    "busy",
    "deleted",
    "forbidden",
    "generation_current",
    "incomplete",
    "invalid",
    "not_found",
    "past_window",
    "too_large",
    "unknown_generation",
  ]);
  for (const code of REPLAY_REFUSALS) expect(isHttpErrorCode(code)).toBe(true);
});
test("a replay key is thirty-two lower-case hexadecimal characters", () => {
  expect(isReplayKey("0123456789abcdef0123456789abcdef")).toBe(true);
  for (const bad of [
    "0123456789ABCDEF0123456789abcdef",
    "0123456789abcdef0123456789abcde",
    "0123456789abcdef0123456789abcdef0",
    7,
    null,
  ])
    expect(isReplayKey(bad)).toBe(false);
});
test("waiting updates travel as base64 and come back byte for byte", () => {
  expect(
    encodeReplayUpdates([new Uint8Array([0, 1, 254, 255]), new Uint8Array([])]),
  ).toEqual(["AAH+/w==", ""]);
  expect(decodeReplayUpdates(["AAH+/w==", ""])).toEqual([
    new Uint8Array([0, 1, 254, 255]),
    new Uint8Array([]),
  ]);
  for (const bad of ["AAH+/w==", [7], ["not base64!"], null])
    expect(decodeReplayUpdates(bad)).toBeNull();
  fc.assert(
    fc.property(fc.array(fc.uint8Array()), (updates) => {
      expect(decodeReplayUpdates(encodeReplayUpdates(updates))).toEqual(
        updates,
      );
    }),
    { numRuns: 300 },
  );
});
test("base64 cut short is refused", () => {
  for (const bad of [["AAH+/w="], ["AAH"], ["AAH+/w==", "AA"]])
    expect(decodeReplayUpdates(bad)).toBeNull();
});
test("any value decodes to nothing or to one byte array per string", () => {
  const value = fc.oneof(
    fc.anything(),
    fc.array(fc.oneof(fc.base64String(), fc.string())),
  );
  fc.assert(
    fc.property(value, (input) => {
      const decoded = decodeReplayUpdates(input);
      if (decoded === null) return;
      expect(Array.isArray(input)).toBe(true);
      expect(decoded.map((update) => update instanceof Uint8Array)).toEqual(
        (input as unknown[]).map(() => true),
      );
    }),
    { numRuns: 300 },
  );
});
