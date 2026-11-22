import { afterAll, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createTempTrees } from "@manent/testkit";
import fc from "fast-check";
import {
  TRACE_SOURCES,
  TraceError,
  fetchTraces,
  readTrace,
  replayTrace,
} from "../corpus/traces.ts";
import type { Trace } from "../corpus/traces.ts";

const trees = createTempTrees("manent-traces-");
afterAll(() => trees.removeAll());

function blocksText(doc: CrdtDoc): string[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap((section) =>
    (section.content ?? []).map((block) =>
      (block.content ?? []).map((run) => run.text).join(""),
    ),
  );
}

function gzipJson(value: unknown): Uint8Array<ArrayBuffer> {
  return gzipSync(JSON.stringify(value));
}

async function answerOtherBytes(): Promise<Response> {
  return new Response(gzipJson({ other: true }));
}

type Patch = readonly [number, number, string];

/** Abstract edits made valid against the text they apply to, and that text after each. */
const patchRuns = fc
  .array(
    fc.record({
      at: fc.nat(),
      deleted: fc.nat({ max: 6 }),
      inserted: fc
        .array(fc.constantFrom("a", "b", "\n"), { maxLength: 4 })
        .map((chars) => chars.join("")),
    }),
    { maxLength: 30 },
  )
  .map((edits) => {
    let text = "";
    const patches: Patch[] = [];
    for (const edit of edits) {
      const at = edit.at % (text.length + 1);
      const deleted = Math.min(edit.deleted, text.length - at);
      if (deleted === 0 && edit.inserted === "") continue;
      patches.push([at, deleted, edit.inserted]);
      text = text.slice(0, at) + edit.inserted + text.slice(at + deleted);
    }
    return { patches, text };
  });

test("a replayed trace ends with the trace's own final text", () => {
  const t: Trace = {
    name: "t",
    startContent: "",
    endContent: "ab\ncd",
    patches: [
      [0, 0, "a"],
      [1, 0, "b"],
      [2, 0, "\n"],
      [3, 0, "x"],
      [3, 1, "cd"],
    ],
  };
  const { doc, transactions } = replayTrace(t, { clientId: 1 });
  expect([blocksText(doc), transactions]).toEqual([["ab", "cd"], 5]);
});

test("deleting a newline joins the two blocks", () => {
  const t: Trace = {
    name: "t",
    startContent: "ab\ncd",
    endContent: "abcd",
    patches: [[2, 1, ""]],
  };
  const { doc, transactions } = replayTrace(t, { clientId: 1 });
  expect([blocksText(doc), transactions]).toEqual([["abcd"], 1]);
});

test("a fetched trace whose hash differs is refused and not kept", async () => {
  const dir = await trees.tree({});
  const fetched = await fetchTraces({
    dir,
    fetch: Object.assign(answerOtherBytes, { preconnect: fetch.preconnect }),
  });
  expect(fetched).toEqual(
    TRACE_SOURCES.map(({ name }) => ({
      name,
      ok: false,
      reason: "hash differs",
    })),
  );
  expect(readdirSync(dir)).toEqual([]);
});

test("bytes that are not a trace are refused with a code", () => {
  expect(() => readTrace(new Uint8Array([1, 2]))).toThrow(TraceError);
});

test("a trace of the wrong shape is refused with its code", () => {
  const refusals = [
    gzipJson({ startContent: "", endContent: "", txns: [{ patches: [[0]] }] }),
    gzipJson({ startContent: 1, endContent: "", txns: [] }),
    gzipJson({ startContent: "", endContent: "\u{1F3AC}", txns: [] }),
    gzipSync("not json"),
  ].map((bytes) => {
    try {
      readTrace(bytes);
      return null;
    } catch (error) {
      return error instanceof TraceError ? error.code : error;
    }
  });
  expect(refusals).toEqual([
    "bad_trace",
    "bad_trace",
    "bad_trace",
    "bad_trace",
  ]);
});

test("the patches of every transaction are read in order", () => {
  const bytes = gzipJson({
    startContent: "",
    endContent: "ba",
    txns: [
      { time: "2021-04-19T06:06:58.000Z", patches: [[0, 0, "a"]] },
      {
        patches: [
          [0, 0, "c"],
          [0, 1, "b"],
        ],
      },
    ],
  });
  expect(readTrace(bytes)).toEqual({
    name: "",
    startContent: "",
    endContent: "ba",
    patches: [
      [0, 0, "a"],
      [0, 0, "c"],
      [0, 1, "b"],
    ],
  });
});

test("any bytes end in a trace or a refusal with a code", () => {
  const nearPatch = fc.oneof(
    fc.tuple(fc.nat(), fc.nat(), fc.string()),
    fc.tuple(fc.integer({ min: -3, max: -1 }), fc.nat(), fc.string()),
    fc.tuple(fc.nat(), fc.double(), fc.string()),
    fc.tuple(fc.nat(), fc.nat()),
    fc.jsonValue(),
  );
  const nearTrace = fc.record({
    startContent: fc.oneof(fc.string(), fc.jsonValue()),
    endContent: fc.oneof(fc.string(), fc.jsonValue()),
    txns: fc.oneof(
      fc.array(fc.record({ patches: fc.array(nearPatch, { maxLength: 3 }) })),
      fc.jsonValue(),
    ),
  });
  const bytes = fc.oneof(
    fc.uint8Array(),
    nearTrace.map(gzipJson),
    fc.jsonValue().map(gzipJson),
  );
  fc.assert(
    fc.property(bytes, (input) => {
      try {
        const trace = readTrace(input);
        return (
          typeof trace.startContent === "string" &&
          trace.patches.every(
            ([at, deleted, inserted]) =>
              Number.isSafeInteger(at) &&
              at >= 0 &&
              Number.isSafeInteger(deleted) &&
              deleted >= 0 &&
              typeof inserted === "string",
          )
        );
      } catch (error) {
        return error instanceof TraceError && error.code === "bad_trace";
      }
    }),
    { numRuns: 500 },
  );
});

test("replaying a trace and its text agree for any patch sequence", () => {
  fc.assert(
    fc.property(patchRuns, ({ patches, text }) => {
      const { doc, transactions } = replayTrace(
        { name: "p", startContent: "", endContent: text, patches },
        { clientId: 1 },
      );
      expect([blocksText(doc).join("\n"), transactions]).toEqual([
        text,
        patches.length,
      ]);
    }),
    { numRuns: 200 },
  );
});

function credit(name: string): string {
  return `${name}, from the editing-traces dataset (https://github.com/josephg/editing-traces), CC BY 4.0; replayed into script documents.`;
}

function url(name: string): string {
  return `https://github.com/josephg/editing-traces/raw/master/sequential_traces/${name}.json.gz`;
}

test("every source is credited to the dataset under its licence", () => {
  const locked = [
    {
      name: "seph-blog1",
      sha256:
        "43b5d326ca8c9094cd94e28ab66cd2f3073ce2893db959a0388c53f0aed8156d",
    },
    {
      name: "rustcode",
      sha256:
        "a13d472b5641dcad18d52882eff8c2d68ecbc27aa0f1e5a17eeb42f0f3130f38",
    },
    {
      name: "sveltecomponent",
      sha256:
        "0393353a1ff0281f4a2adad080b0843bffa7988f9a4869ed04faf0984f78a234",
    },
    {
      name: "json-crdt-patch",
      sha256:
        "c7e60bdeacd8fd3a560f34f3d306ec88d4976e6a3cc6820ecb88f5c1017dca5a",
    },
    {
      name: "json-crdt-blog-post",
      sha256:
        "30d0c2f2f4c37cb61a27c940eda73fe2767405092da270185c5ddd9c409e716d",
    },
  ];
  expect(TRACE_SOURCES).toEqual(
    locked.map(({ name, sha256 }) => ({
      name,
      url: url(name),
      licence: "CC-BY-4.0",
      sha256,
      credit: credit(name),
    })),
  );
});
