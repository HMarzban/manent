import { expect, test } from "bun:test";
import {
  HTTP_ERROR_CODES,
  SERVER_STATES,
  isHttpErrorCode,
  isServerState,
} from "../src/index.ts";
import type {
  DemoResponse,
  MeResponse,
  SignInOptions,
  SignInResponse,
} from "../src/index.ts";

test("the HTTP error codes and the server states are fixed lists", () => {
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
  ]);
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
