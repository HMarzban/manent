import { expect, test } from "bun:test";
import { applyInspecting, createDoc, jsonMap } from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import { indexDocId } from "@manent/sync-protocol";
import { validateIndexPush } from "../src/index.ts";
import type { Access } from "../src/index.ts";

const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
const PROJECT_INDEX = {
  docId: indexDocId("project", PROJECT),
  home: { kind: "project" as const, id: PROJECT },
};

function inspectPush(write: (doc: CrdtDoc) => void): TransactionReport {
  const source = createDoc({ clientId: 2 });
  const before = source.encodeStateVector();
  write(source);
  const report = applyInspecting(
    createDoc({ clientId: 1 }),
    source.diff(before),
  );
  if (report === null) throw new RangeError("the update changed nothing");
  return report;
}

test("project index accepts owner and issue_revisions pushes to settings_meta and rejects plain editors", () => {
  const push = inspectPush((doc) => {
    jsonMap(doc, "template").set("project.targetPages", 58);
    jsonMap(doc, "settings_meta").set("project.targetPages", {
      userId: "dana",
      setAt: 1_700_000_000_000,
      replaced: null,
    });
  });

  const owner: Access = { role: "owner", capabilities: [] };
  const issuer: Access = { role: "edit", capabilities: ["issue_revisions"] };
  const editor: Access = { role: "edit", capabilities: [] };

  expect(validateIndexPush(push, PROJECT_INDEX, owner)).toEqual([]);
  expect(validateIndexPush(push, PROJECT_INDEX, issuer)).toEqual([]);
  expect(validateIndexPush(push, PROJECT_INDEX, editor)).toEqual([
    {
      path: "maps.settings_meta",
      code: "not_index",
      severity: "reject",
      message:
        "a push wrote the settings_meta map, which a person of role edit may not write",
    },
    {
      path: "maps.template",
      code: "not_index",
      severity: "reject",
      message:
        "a push wrote the template map, which a person of role edit may not write",
    },
  ]);
});
