// The pages under site/: their links and references, pictures, measured figures, files, icons and security policy.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

const site = join(import.meta.dir, "..", "..", "site");
const index = await Bun.file(join(site, "index.html")).text();
const compare = await Bun.file(join(site, "compare.html")).text();
const notFound = await Bun.file(join(site, "404.html")).text();
const sprite = await Bun.file(join(site, "assets", "icons.svg")).text();

interface Element {
  tag: string;
  attributes: Map<string, string>;
}

/** What the checks below read from a page: every element, each figure's kind and caption, the measured placeholders, and the inline blocks. */
interface PageParts {
  elements: Element[];
  figures: { kind: "media" | "picture" | "none"; caption: string }[];
  measured: string[];
  scripts: string[];
  styles: string[];
}

async function readPage(html: string): Promise<PageParts> {
  const read: PageParts = {
    elements: [],
    figures: [],
    measured: [],
    scripts: [],
    styles: [],
  };
  const figure = () => read.figures.at(-1)!;
  await new HTMLRewriter()
    .on("*", {
      element: (el) =>
        void read.elements.push({
          tag: el.tagName,
          attributes: new Map(el.attributes),
        }),
    })
    .on("figure", {
      element: () => void read.figures.push({ kind: "none", caption: "" }),
    })
    .on("figure [role=img][aria-label]", {
      element: () => void (figure().kind = "picture"),
    })
    .on("figure img, figure video", {
      element: () => void (figure().kind = "media"),
    })
    .on("figcaption", { text: (t) => void (figure().caption += t.text) })
    .on("[data-placeholder=measured]", {
      element: () => void read.measured.push(""),
      text: (t) => void (read.measured[read.measured.length - 1] += t.text),
    })
    .on("script:not([type]):not([src])", {
      element: () => void read.scripts.push(""),
      text: (t) => void (read.scripts[read.scripts.length - 1] += t.text),
    })
    .on("style", {
      element: () => void read.styles.push(""),
      text: (t) => void (read.styles[read.styles.length - 1] += t.text),
    })
    .transform(new Response(html))
    .text();
  return read;
}

const page = await readPage(index);
/** The pages a visitor can reach from the landing page, by file name. */
const PAGES: Record<string, PageParts> = {
  "index.html": page,
  "compare.html": await readPage(compare),
};
const ALL = [...Object.values(PAGES), await readPage(notFound)];
const valuesIn = (read: PageParts, name: string): string[] =>
  read.elements.flatMap(({ attributes }) => attributes.get(name) ?? []);

test("every in-page link and reference on each page names an element on it", () => {
  const missing = Object.entries(PAGES).flatMap(([file, read]) => {
    const ids = new Set(valuesIn(read, "id"));
    const named = [
      ...read.elements
        .filter(({ tag }) => tag === "a")
        .flatMap(({ attributes }) => attributes.get("href") ?? [])
        .filter((href) => href.startsWith("#") && href !== "#")
        .map((href) => href.slice(1)),
      ...["aria-controls", "aria-labelledby", "aria-describedby"].flatMap(
        (name) => valuesIn(read, name).flatMap((value) => value.split(" ")),
      ),
    ];
    return named.filter((id) => !ids.has(id)).map((id) => `${file}#${id}`);
  });
  expect(missing).toEqual([]);
});

test("every link from one page to another names a page of the site and an element on it, or a file of the site", async () => {
  const links = Object.values(PAGES).flatMap((read) =>
    read.elements
      .filter(({ tag }) => tag === "a")
      .flatMap(({ attributes }) => attributes.get("href") ?? [])
      .filter((href) => !/^[a-z]+:/.test(href) && !href.startsWith("#")),
  );
  const missing: string[] = [];
  for (const href of new Set(links)) {
    const [path = "", id] = href.split("#");
    const target = PAGES[path === "./" ? "index.html" : path];
    const found = target
      ? id === undefined || valuesIn(target, "id").includes(id)
      : id === undefined && (await Bun.file(join(site, path)).exists());
    if (!found) missing.push(href);
  }
  expect(links).toContain("compare.html");
  expect(links).toContain("./#compare");
  expect(links).toContain("media/demo-recording.mp4");
  expect(missing).toEqual([]);
});

test("every picture on the landing page says what it shows, and every screenshot and recording says it is of the demo", () => {
  expect(
    page.figures
      .filter(({ kind, caption }) =>
        kind === "media"
          ? !/(Screenshot|Recording) of the demo/.test(caption)
          : kind === "none" || caption.trim() === "",
      )
      .map(({ caption }) => caption.trim()),
  ).toEqual([]);
});

test("a figure that waits for its benchmark is words, never a number", () => {
  expect(page.measured.length).toBeGreaterThan(0);
  expect(page.measured.filter((text) => /\d/.test(text))).toEqual([]);
});

test("every file each page loads is in the site folder", async () => {
  const local = ALL.flatMap((read) =>
    read.elements.flatMap(({ tag, attributes }) => {
      const href = attributes.get("href");
      return [
        ...["src", "srcset", "poster"].flatMap(
          (name) => attributes.get(name) ?? [],
        ),
        ...(href !== undefined &&
        (tag === "use" ||
          (tag === "link" &&
            ["stylesheet", "preload"].includes(attributes.get("rel") ?? "")))
          ? [href.split("#")[0]!]
          : []),
      ];
    }),
  ).filter((path) => path !== "" && !path.startsWith("data:"));
  const missing: string[] = [];
  for (const path of new Set(local))
    if (/^[a-z]+:/.test(path) || !(await Bun.file(join(site, path)).exists()))
      missing.push(path);
  expect(missing).toEqual([]);
});

test("every icon a page draws is a symbol of the sprite", () => {
  const symbols = new Set(
    [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(([, id]) => id),
  );
  const drawn = ALL.flatMap((read) =>
    read.elements
      .filter(({ tag }) => tag === "use")
      .map(({ attributes }) => attributes.get("href")?.split("#")[1] ?? ""),
  );
  expect(drawn.length).toBeGreaterThan(0);
  expect([...new Set(drawn)].filter((id) => !symbols.has(id))).toEqual([]);
});

/** The CSP source for an inline block of `text`. */
const hashOf = (text: string): string =>
  `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

test("each page's content security policy allows the site's own files and its inline blocks, and nothing else", () => {
  const found = ALL.map((read) => {
    const directives = (
      read.elements
        .find(
          ({ attributes }) =>
            attributes.get("http-equiv") === "Content-Security-Policy",
        )
        ?.attributes.get("content") ?? ""
    )
      .split(";")
      .map((part) => part.trim());
    const directive = (name: string): string =>
      directives.find((part) => part.startsWith(`${name} `)) ??
      `${name} 'none'`;
    return {
      policy: [
        directive("default-src"),
        directive("script-src"),
        directive("style-src"),
      ],
      allowed: [
        "default-src 'none'",
        ["script-src 'self'", ...read.scripts.map(hashOf)].join(" "),
        ["style-src 'self'", ...read.styles.map(hashOf)].join(" "),
      ],
    };
  });
  expect(found.map(({ policy }) => policy)).toEqual(
    found.map(({ allowed }) => allowed),
  );
});

test("the landing page's structured data is JSON", () => {
  const data = index.match(
    new RegExp('<script type="application/ld\\+json">([\\s\\S]*?)</script>'),
  )?.[1];
  const parsed: unknown = JSON.parse(data ?? "");
  expect(parsed).toMatchObject({ "@context": "https://schema.org" });
});

test("every length the landing page gives the recording is the length its captions run to", async () => {
  const captions = await Bun.file(
    join(site, "media", "demo-recording.vtt"),
  ).text();
  const [, minutes = "", seconds = "", millis = ""] =
    [...captions.matchAll(/--> (\d+):(\d+)\.(\d+)/g)].at(-1) ?? [];
  const length = Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
  const said = [...index.matchAll(/(\d+) seconds/g)].map(([, n]) => n);
  expect(new Set(said)).toEqual(new Set([String(Math.ceil(length))]));
});
