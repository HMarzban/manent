import { beforeEach, expect, test } from "bun:test";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import { OWNER_CAPABILITIES, createDocumentAccess } from "../src/index.ts";
import type { DocumentAccess } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
const V1 = {
  current: { protocol: 1, schema: 1, engine: 0, table: 0 },
  min: { protocol: 1, schema: 1, engine: 0, table: 0 },
};

let storage: MemoryStorage;
let access: DocumentAccess;
beforeEach(() => {
  storage = createMemoryStorage({ now: () => 1_000 });
  access = createDocumentAccess({ storage, versions: V1 });
});

test("a person makes a script and owns it; making it again changes nothing", () => {
  const body = {
    docId: DOC,
    kind: "script" as const,
    home: `project:${PROJECT}`,
  };
  expect(access.create("sam", body)).toEqual({
    ok: true,
    document: { ...body, generation: 1, created: true },
  });
  expect(access.create("sam", body)).toEqual({
    ok: true,
    document: { ...body, generation: 1, created: false },
  });
  expect(access.resolve("sam", DOC)).toEqual({
    ok: true,
    access: { role: "owner", capabilities: [...OWNER_CAPABILITIES] },
    home: { kind: "project", id: PROJECT },
    kind: "script",
  });
  expect(
    storage.open({ kind: "project", id: PROJECT }).log.get(DOC),
  ).toMatchObject({
    kind: "script",
    ownerUserId: null,
    schemaVersion: 1,
    engineVersion: 0,
  });
});

function codeOf(body: unknown): string {
  const r = access.create("sam", body);
  return r.ok ? "ok" : r.code;
}

test("each way a request can be wrong has its code", () => {
  const P = `project:${PROJECT}`;
  for (const body of [
    null,
    "x",
    {},
    { docId: DOC, kind: "script" },
    { docId: DOC, kind: 7, home: "user" },
    { docId: DOC, kind: "script", home: "user" },
    { docId: DOC, kind: "private", home: P },
    { docId: DOC, kind: "script", home: "project:nope" },
    { docId: "NOT-A-UUID", kind: "script", home: P },
    { docId: DOC.toUpperCase(), kind: "script", home: P },
    { docId: DOC, kind: "index", home: P },
    { docId: DOC, kind: "script", home: P, workspaceId: "bad id!" },
    { docId: DOC, kind: "script", home: P, workspaceId: "" },
    { docId: DOC, kind: "script", home: P, workspaceId: "m".repeat(65) },
    { docId: DOC, kind: "script", home: P, workspaceId: null },
    { docId: DOC, kind: "private", home: "user", workspaceId: "medium" },
  ])
    expect(codeOf(body)).toBe("bad_request");
  expect(codeOf({ docId: DOC, kind: "draft", home: P })).toBe(
    "unsupported_kind",
  );
});

test("a project is its first writer's until they share it", () => {
  const P = `project:${PROJECT}`;
  access.create("sam", { docId: DOC, kind: "script", home: P });
  expect(
    access.create("leo", { docId: DOC2, kind: "script", home: P }),
  ).toEqual({ ok: false, code: "forbidden" });
  expect(access.create("leo", { docId: DOC, kind: "script", home: P })).toEqual(
    { ok: false, code: "forbidden" },
  );
  storage.directory.setRole(DOC, "dana", "edit", []);
  expect(access.create("dana", { docId: DOC2, kind: "ink", home: P }).ok).toBe(
    true,
  );
  expect(access.create("sam", { docId: DOC, kind: "ink", home: P })).toEqual({
    ok: false,
    code: "exists_elsewhere",
  });
});

test("a private copy is its owner's alone", () => {
  expect(
    access.create("sam", { docId: DOC, kind: "private", home: "user" }),
  ).toMatchObject({ ok: true, document: { home: "user:sam" } });
  expect(access.resolve("dana", DOC)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(
    storage.open({ kind: "user", id: "sam" }).log.get(DOC)!.ownerUserId,
  ).toBe("sam");
});

test("a deleted document stays deleted", () => {
  const body = { docId: DOC, kind: "script", home: `project:${PROJECT}` };
  access.create("sam", body);
  storage.directory.setRole(DOC, "leo", "view", []);
  expect(access.remove("leo", { docId: DOC })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(access.remove("sam", { docId: DOC2 })).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(access.remove("sam", {})).toEqual({ ok: false, code: "bad_request" });
  expect(access.remove("sam", { docId: DOC })).toEqual({ ok: true });
  expect(access.remove("sam", { docId: DOC })).toEqual({ ok: true });
  expect(access.resolve("sam", DOC)).toEqual({ ok: false, code: "deleted" });
  expect(access.create("sam", body)).toEqual({ ok: false, code: "deleted" });
  // nothing is erased
  expect(
    storage.open({ kind: "project", id: PROJECT }).log.get(DOC),
  ).not.toBeNull();
});

test("a stored role or capability this build does not know gives no access it cannot name", () => {
  access.create("sam", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(DOC, "ana", "wizard", []);
  expect(access.resolve("ana", DOC)).toEqual({ ok: false, code: "forbidden" });
  storage.directory.setRole(DOC, "ana", "edit", ["delete", "teleport"]);
  expect(access.resolve("ana", DOC)).toEqual({
    ok: true,
    access: { role: "edit", capabilities: ["delete"] },
    home: { kind: "project", id: PROJECT },
    kind: "script",
  });
});
