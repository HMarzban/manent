import { expect, test } from "bun:test";
import { RULES } from "../boundaries.config.ts";
import type { BoundaryRules, WorkspaceRule } from "../boundaries.config.ts";

// The table is checked against itself; fixture tests never read it.
const rows = Object.entries(RULES.workspaces);
const values = (r: WorkspaceRule) =>
  r.internal === "*" ? [] : r.internal.filter((t) => !r.typesOnly.includes(t));

/** A depth-first walk over every listed edge, types-only ones included. */
function hasCycle(rules: BoundaryRules): boolean {
  const done = new Set<string>();
  const visit = (key: string, path: readonly string[]): boolean => {
    if (path.includes(key)) return true;
    if (done.has(key)) return false;
    const internal = rules.workspaces[key]?.internal ?? [];
    const cycle =
      internal !== "*" && internal.some((to) => visit(to, [...path, key]));
    done.add(key);
    return cycle;
  };
  return Object.keys(rules.workspaces).some((key) => visit(key, []));
}

test("no edge points up a layer, and the edges have no cycle", () => {
  for (const [key, r] of rows) {
    if (r.layer === "tooling" || r.internal === "*") continue;
    for (const to of r.internal)
      expect({
        key,
        to,
        up: (RULES.workspaces[to]!.layer as number) > r.layer,
      }).toEqual({ key, to, up: false });
  }
  expect(hasCycle(RULES)).toBe(false);
});

test("a pure row takes values only from pure rows, and a browser row never from a Bun row", () => {
  for (const [key, r] of rows)
    for (const to of values(r)) {
      const target = RULES.workspaces[to]!.runtime;
      if (r.runtime === "pure")
        expect({ key, to, target }).toEqual({ key, to, target: "pure" });
      if (r.runtime === "browser")
        expect({ key, to, bun: target === "bun" }).toEqual({
          key,
          to,
          bun: false,
        });
    }
});

test("every row is well formed", () => {
  for (const [key, r] of rows) {
    if (r.internal !== "*")
      for (const to of [...r.internal, ...r.typesOnly])
        expect(Object.keys(RULES.workspaces)).toContain(to);
    if (r.internal !== "*")
      for (const to of r.typesOnly) expect(r.internal).toContain(to);
    expect({ key, list: Array.isArray(r.external) }).toEqual({
      key,
      list: r.runtime === "pure",
    });
    if (r.runtime !== "pure") expect(r.forbiddenGlobals).toEqual([]);
  }
  for (const homes of Object.values(RULES.restrictedExternal))
    for (const home of homes)
      expect(Object.keys(RULES.workspaces)).toContain(home);
});

test("the edges the model forbids are absent", () => {
  expect(
    rows.filter(([, r]) => r.internal === "*").map(([key]) => key),
  ).toEqual(["testkit", "bench", "e2e", "tools"]);
  expect(RULES.workspaces["sync-protocol"]!.internal).toEqual([]);
  expect(RULES.workspaces.storage!.internal).toEqual(["perf"]);
  expect(RULES.workspaces.editor!.internal).not.toContain("crdt");
  expect(RULES.workspaces.pagination).toMatchObject({
    internal: ["schema"],
    typesOnly: ["schema"],
  });
  expect(RULES.workspaces["server-core"]!.typesOnly).toEqual(["storage"]);
  expect(RULES.workspaces["sync-client"]).toMatchObject({
    runtime: "pure",
    forbiddenGlobals: [
      "WebSocket",
      "BroadcastChannel",
      "fetch",
      "setTimeout",
      "setInterval",
      "Date",
    ],
  });
  expect(RULES.restrictedExternal["y-prosemirror"]).toEqual(["crdt-binding"]);
  expect(RULES.restrictedExternal["bun:sqlite"]).toEqual([
    "storage",
    "local-node",
  ]);
  expect(RULES.restrictedExternal["prosemirror-view"]).toEqual([
    "editor",
    "crdt-binding",
    "e2e",
  ]);
});

test("the edges the coming packages need are there, each in its direction", () => {
  expect(RULES.workspaces["crdt-binding"]).toMatchObject({
    internal: ["crdt", "editor", "schema"],
    typesOnly: ["editor"],
  });
  expect(RULES.workspaces.server!.internal).toEqual(
    expect.arrayContaining(["crdt", "revisions"]),
  );
  expect(RULES.workspaces.desktop!.internal).toContain("sync-protocol");
  expect(RULES.workspaces.revisions!.internal).toContain("pagination");
  expect(RULES.workspaces.pagination!.internal).not.toContain("revisions");
  expect(RULES.workspaces.web!.internal).toContain("demo");
  expect(RULES.workspaces.web!.typesOnly).not.toContain("demo");
});

test("test code is imported by tests and tooling only, and three zones are fenced", () => {
  expect(RULES.workspaces.testkit!.importable).toBe("tests");
  expect(RULES.workspaces.web!.internal).not.toContain("testkit");
  expect(RULES.workspaces.web!.typesOnly).toEqual([]);
  expect(RULES.zones).toEqual([
    {
      workspace: "server-core",
      only: ["src/http/"],
      globals: ["Bun"],
      values: [],
    },
    {
      workspace: "web",
      only: ["src/editor-host/"],
      globals: [],
      values: ["@manent/editor", "@manent/crdt-binding"],
    },
    {
      workspace: "web",
      only: ["src/demo/", "src/screens/states/"],
      globals: [],
      values: ["@manent/demo"],
    },
  ]);
});
