import { expect, test } from "bun:test";
import {
  BLOCK_SLACK_CELLS,
  ENGINE_VERSION,
  FONT_FACE_KEYS,
  WRAP_MODE,
  engineFor,
  paginate,
  profileFor,
} from "@manent/pagination";
import {
  PAGE_CSS,
  PAGE_GAP_PX,
  faceDescriptors,
  profileCss,
  toUnicodeRange,
} from "../src/index.ts";
import { blockAttrs } from "../src/pagination/block-attrs.ts";

/** The declarations of the one rule with exactly that selector, trimmed. */
function rule(css: string, selector: string): string[] {
  const bodies = [...css.matchAll(new RegExp("([^{}]+)\\{([^{}]*)\\}", "g"))]
    .filter((m) => m[1]!.trim() === selector)
    .map((m) => m[2]!);
  if (bodies.length !== 1)
    throw new Error(`${bodies.length} rules for ${selector}`);
  return bodies[0]!
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d !== "");
}

const sp = profileFor("screenplay")!;

test("the page is set in physical units, in the real faces, with ligatures off", () => {
  expect(rule(PAGE_CSS, ".mn-page-view")).toEqual(
    expect.arrayContaining([
      'font: var(--geo-font-size, 12pt)/var(--geo-line, 12pt) "Courier Prime", monospace',
      "font-synthesis: none",
      "font-kerning: none",
      "font-variant-ligatures: none",
      "letter-spacing: 0",
      "hyphens: none",
      "tab-size: 1",
      `white-space: ${WRAP_MODE}`,
      "overflow-wrap: break-word",
      "position: relative",
      "background: transparent",
    ]),
  );
  expect(rule(PAGE_CSS, ".mn-pages")).toEqual(
    expect.arrayContaining([
      "--geo-cell: 7.2pt",
      "--geo-line: 12pt",
      "--geo-unit: 6pt",
      "transform-origin: 0 0",
    ]),
  );
});

test("the page's glyphs keep their fractional advances at every device scale", () => {
  expect(rule(PAGE_CSS, ".mn-page-view")).toContain(
    "text-rendering: geometricPrecision",
  );
});

test("the paper is an underlay, and nothing that holds text has a background", () => {
  expect(rule(PAGE_CSS, ".mn-sheet")).toEqual(
    expect.arrayContaining([
      "position: absolute",
      "width: var(--geo-page-w)",
      "height: var(--geo-page-h)",
      "background: var(--page-paper)",
    ]),
  );
  for (const sel of [
    ".section",
    "p.el",
    ".pb",
    ".pb-gap",
    ".pb-fill",
    ".pb-head",
    ".pb-foot",
  ])
    expect(
      rule(PAGE_CSS, sel).filter((d) => d.startsWith("background")),
    ).toEqual([]);
  expect(PAGE_CSS).not.toContain("will-change");
});

test("sections are contained by content-visibility and nothing else", () => {
  expect(rule(PAGE_CSS, ".section")).toEqual(
    expect.arrayContaining([
      "display: flow-root",
      "content-visibility: auto",
      "padding-left: var(--geo-left)",
      "padding-right: var(--geo-right)",
    ]),
  );
  expect(new RegExp("[^-]contain\\s*:").test(PAGE_CSS)).toBe(false);
  expect([
    rule(PAGE_CSS, ".section.keep"),
    rule(PAGE_CSS, ".no-cv .section"),
  ]).toEqual([
    ["content-visibility: visible"],
    ["content-visibility: visible"],
  ]);
});

test("furniture is generated content on plain blocks", () => {
  expect(rule(PAGE_CSS, ".pb [data-text]::before")).toEqual([
    "content: attr(data-text)",
  ]);
  expect(rule(PAGE_CSS, ".el[data-contd]::after")).toContain(
    "content: attr(data-contd)",
  );
  expect([
    rule(PAGE_CSS, ".el[data-open]::before"),
    rule(PAGE_CSS, ".el[data-mark]::before"),
  ]).toEqual([["content: attr(data-open)"], ["content: attr(data-mark)"]]);
  expect(
    ["display: flex", "display: grid"].filter((d) => PAGE_CSS.includes(d)),
  ).toEqual([]);
});

test("each element's box is its cells plus the slack, and space before is padding", () => {
  expect(rule(PAGE_CSS, "p.el")).toEqual(
    expect.arrayContaining([
      "margin: 0",
      "clear: both",
      "padding-top: calc(var(--el-before) * var(--geo-line))",
      "margin-left: calc((var(--el-indent) - var(--el-slack-left)) * var(--geo-cell))",
      `width: calc((var(--el-width) + ${BLOCK_SLACK_CELLS}) * var(--geo-cell))`,
      "line-height: calc(var(--el-spacing) * var(--geo-line))",
      "text-indent: calc(var(--el-first) * var(--geo-cell))",
    ]),
  );
  expect(rule(PAGE_CSS, "p.el.pg-first")).toEqual([
    "padding-top: calc(var(--el-drop, 0) * var(--geo-line))",
  ]);
  const css = profileCss(sp);
  expect(rule(css, ".el-character")).toEqual([
    "--el-indent: 22",
    "--el-width: 38",
    "--el-before: 1",
    "--el-spacing: 1",
    "--el-first: 0",
    "--el-slack-left: 0",
    "text-align: left",
    "text-transform: uppercase",
  ]);
  expect([
    rule(css, ".el-transition").slice(5, 7),
    rule(css, ".el-act_break").slice(5, 7),
  ]).toEqual([
    ["--el-slack-left: 0.5", "text-align: right"],
    ["--el-slack-left: 0.25", "text-align: center"],
  ]);
  expect(rule(css, ".mn-pages")).toEqual([
    "--geo-page-w: 612pt",
    "--geo-page-h: 1056px",
    "--geo-left: 108pt",
    "--geo-right: 72pt",
    "--geo-top: 96px",
    "--geo-bottom: 96px",
    "--geo-line: 16px",
    "--geo-unit: 8px",
    "--geo-cell: 7.2pt",
    "--geo-font-size: 12pt",
    "--geo-mirror-delta: 0pt",
    "--geo-lines: 54",
    "--geo-column: 60",
    "--geo-cue-indent: 22",
    `--geo-gap: ${PAGE_GAP_PX}px`,
  ]);
  expect(rule(profileCss(profileFor("manuscript")!), ".el-body")).toEqual(
    expect.arrayContaining(["--el-first: 5", "--el-spacing: 2"]),
  );
  // Clamped --el-drop matches engine keep.ts (linesPerPage - 8) when linesPerPage < 26.
  expect(
    rule(
      profileCss(profileFor("manuscript", { linesPerPage: 16 })!),
      ".el-chapter",
    ),
  ).toContain("--el-drop: 8");
});

test("an element the format has no row for is styled as General", () => {
  expect(rule(profileCss(sp), ".el-ink_line")).toEqual([
    "--el-indent: 0",
    "--el-width: 60",
    "--el-before: 1",
    "--el-spacing: 1",
    "--el-first: 0",
    "--el-slack-left: 0",
    "text-align: left",
  ]);
});

test("font faces", () => {
  expect(toUnicodeRange([0x20, 0x7e, 0xa0, 0xff, 0x131, 0x131])).toBe(
    "U+20-7E, U+A0-FF, U+131",
  );
  const faces = faceDescriptors([0x20, 0x7e], [0x100, 0x130]);
  expect(
    faces.map((f) => [
      f.key,
      f.weight,
      f.style,
      f.unicodeRange,
      f.display,
      f.family,
    ]),
  ).toEqual(
    FONT_FACE_KEYS.map((key) => [
      key,
      key.includes("700") ? "700" : "400",
      key.endsWith("italic") ? "italic" : "normal",
      key.startsWith("latin-ext") ? "U+100-130" : "U+20-7E",
      "block",
      "Courier Prime",
    ]),
  );
  expect(
    faces.every(
      (f) =>
        f.source.endsWith(".woff2") &&
        f.source.includes(`courier-prime-${f.key}`),
    ),
  ).toBe(true);
});

test("all-caps mark is uppercased in PAGE_CSS and overridden alignment updates --el-slack-left", () => {
  expect(rule(PAGE_CSS, ".caps")).toEqual(["text-transform: uppercase"]);

  const engine = engineFor(ENGINE_VERSION)!;
  const blocks = [
    {
      id: "b-center",
      type: "dialogue",
      kind: null,
      text: "Centred line.",
      styles: null,
      dual: null,
      num: null,
      align: "center" as const,
      indent: null,
      width: null,
      spaceBefore: null,
      noContd: false,
    },
    {
      id: "b-right",
      type: "action",
      kind: null,
      text: "Right line.",
      styles: null,
      dual: null,
      num: null,
      align: "right" as const,
      indent: null,
      width: null,
      spaceBefore: null,
      noContd: false,
    },
  ];
  const p = paginate(blocks, sp);
  const rows = new Set(Object.values(sp.elements));
  const ctx = { p, engine, firsts: new Set<number>(), rows };
  expect([
    blockAttrs(ctx, 0)?.["style"],
    blockAttrs(ctx, 1)?.["style"],
  ]).toEqual([
    "--el-indent: 10; --el-width: 35; --el-before: 0; --el-slack-left: 0.25; text-align: center",
    "--el-indent: 0; --el-width: 60; --el-before: 1; --el-slack-left: 0.5; text-align: right",
  ]);
});

test("omitted scene body blocks and replaced original headings take no layout room", () => {
  expect(
    rule(
      PAGE_CSS,
      "p.el.el-hidden, .mn-omitted-orig, p.el[data-omitted] > br.ProseMirror-trailingBreak",
    ),
  ).toEqual(["display: none"]);
  expect(rule(PAGE_CSS, ".mn-omitted")).toEqual(["user-select: none"]);
});

test("removed block widgets lay out as screenplay blocks and pb-fill honours --fill-trim", () => {
  expect(rule(PAGE_CSS, "del.el")).toEqual(
    expect.arrayContaining([
      "display: block",
      "margin: 0",
      "clear: both",
      "padding-top: calc(var(--el-before) * var(--geo-line))",
      "margin-left: calc((var(--el-indent) - var(--el-slack-left)) * var(--geo-cell))",
      `width: calc((var(--el-width) + ${BLOCK_SLACK_CELLS}) * var(--geo-cell))`,
      "line-height: calc(var(--el-spacing) * var(--geo-line))",
      "text-indent: calc(var(--el-first) * var(--geo-cell))",
    ]),
  );
  expect(rule(PAGE_CSS, ".pb-fill")).toEqual([
    "height: max(0px, calc(max(0, var(--fill)) * var(--geo-unit) - var(--fill-trim, 0px)))",
  ]);
});
