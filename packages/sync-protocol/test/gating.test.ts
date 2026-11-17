import { expect, test } from "bun:test";
import { gateConnection, gateDocument } from "../src/index.ts";
import type { ServerVersions, VersionSet } from "../src/index.ts";

const v = (
  protocol: number,
  schema: number,
  engine: number,
  table: number,
): VersionSet => ({
  protocol,
  schema,
  engine,
  table,
});
const server: ServerVersions = { current: v(2, 3, 4, 5), min: v(1, 2, 3, 4) };

test("a client at or above every minimum connects", () => {
  expect(gateConnection(v(1, 2, 3, 4), server)).toEqual({
    ok: true,
    clientNewer: false,
  });
  expect(gateConnection(v(2, 3, 4, 5), server)).toEqual({
    ok: true,
    clientNewer: false,
  });
  expect(gateConnection(v(2, 4, 4, 5), server)).toEqual({
    ok: true,
    clientNewer: true,
  });
});

test("a client below a minimum is closed with 4408, naming the first field that fails", () => {
  expect(gateConnection(v(0, 2, 3, 4), server)).toEqual({
    ok: false,
    code: 4408,
    field: "protocol",
  });
  expect(gateConnection(v(1, 1, 3, 4), server)).toEqual({
    ok: false,
    code: 4408,
    field: "schema",
  });
  expect(gateConnection(v(1, 2, 2, 4), server)).toEqual({
    ok: false,
    code: 4408,
    field: "engine",
  });
  expect(gateConnection(v(1, 2, 3, 3), server)).toEqual({
    ok: false,
    code: 4408,
    field: "table",
  });
  expect(gateConnection(v(0, 0, 0, 0), server)).toEqual({
    ok: false,
    code: 4408,
    field: "protocol",
  });
});

test("a client older than a document's schema or engine opens it read-only", () => {
  expect(gateDocument(v(1, 2, 3, 4), { minSchema: 3, engineVersion: 3 })).toBe(
    "read_only",
  );
  expect(gateDocument(v(1, 3, 2, 4), { minSchema: 3, engineVersion: 3 })).toBe(
    "read_only",
  );
  expect(gateDocument(v(1, 3, 3, 4), { minSchema: 3, engineVersion: 3 })).toBe(
    "edit",
  );
  expect(gateDocument(v(1, 9, 9, 4), { minSchema: 3, engineVersion: 3 })).toBe(
    "edit",
  ); // a newer client runs the document's pinned engine
});
