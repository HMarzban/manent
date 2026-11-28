import { expect, test } from "bun:test";
import { paginate, profileFor, toLayoutBlocks } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import { documentOfPages } from "../corpus/documents.ts";
import { storySet } from "../corpus/stories.ts";

const PINNED_30_PAGE_HASH = "2e595ee7b29230f4";

test("the generator is deterministic for a seed and different for another", () => {
  const a = documentOfPages({
    format: "screenplay",
    pages: 30,
    seed: 7,
    sections: "even",
  });
  expect(
    documentOfPages({
      format: "screenplay",
      pages: 30,
      seed: 7,
      sections: "even",
    }),
  ).toEqual(a);
  expect(
    documentOfPages({
      format: "screenplay",
      pages: 30,
      seed: 8,
      sections: "even",
    }).doc,
  ).not.toEqual(a.doc);
  expect(Bun.hash(JSON.stringify(a.doc)).toString(16)).toBe(
    PINNED_30_PAGE_HASH,
  );
});

test("each document paginates to its page count, and its blocks are counted", () => {
  for (const format of ["screenplay", "manuscript", "stage_play"] as const) {
    const d = documentOfPages({
      format,
      pages: 120,
      seed: 1,
      sections: "even",
    });
    expect([
      d.pages,
      paginate(toLayoutBlocks(blocksOf(d.doc)), profileFor(format)!).pages
        .length,
      d.blocks,
    ]).toEqual([120, 120, blocksOf(d.doc).length]);
  }
}, 60_000);

test("characters are counted in UTF-16 units and sections as the document holds them", () => {
  const d = documentOfPages({
    format: "screenplay",
    pages: 30,
    seed: 1,
    sections: "even",
  });
  const characters = blocksOf(d.doc)
    .flatMap((block) => block.runs)
    .reduce((sum, run) => sum + run.text.length, 0);
  expect([d.characters, d.sections]).toEqual([
    characters,
    Math.ceil(d.blocks / 100),
  ]);
  expect(d.doc.content!.length).toBe(d.sections);
});

test("a script counts many more blocks per page than a book", () => {
  const script = documentOfPages({
    format: "screenplay",
    pages: 120,
    seed: 1,
    sections: "even",
  });
  const book = documentOfPages({
    format: "manuscript",
    pages: 120,
    seed: 1,
    sections: "even",
  });
  // a page of the screenplay holds about 16 blocks, a page of prose about 5
  expect(script.blocks / book.blocks).toBeGreaterThan(3);
}, 60_000);

test("one section holds every block in the flat stand-in", () => {
  const options = { format: "screenplay", pages: 30, seed: 1 } as const;
  const even = documentOfPages({ ...options, sections: "even" });
  const one = documentOfPages({ ...options, sections: "one" });
  expect([one.doc.content!.length, one.sections]).toEqual([1, 1]);
  expect(one.doc.content![0]!.content).toEqual(
    even.doc.content!.flatMap((section) => section.content ?? []),
  );
  expect([one.pages, one.blocks, one.characters]).toEqual([
    even.pages,
    even.blocks,
    even.characters,
  ]);
});

test("a length that is not a positive whole number of pages is refused", () => {
  for (const pages of [0, -3, 2.5])
    expect(() =>
      documentOfPages({
        format: "screenplay",
        pages,
        seed: 1,
        sections: "one",
      }),
    ).toThrow(RangeError);
});

test("story sets have their row counts and lengths", () => {
  const set = storySet({ rows: 80, seed: 1 });
  expect(set.length).toBe(80);
  expect(new Set(set.map((d) => `${d.format} ${d.pages}`))).toEqual(
    new Set(["variety 1", "variety 2"]),
  );
  for (const d of set)
    expect(
      paginate(toLayoutBlocks(blocksOf(d.doc)), profileFor("variety")!).pages
        .length,
    ).toBe(d.pages);
  expect(storySet({ rows: 80, seed: 1 })).toEqual(set);
  expect(storySet({ rows: 80, seed: 2 })).not.toEqual(set);
}, 30_000);
