// The pages under site/: their links and references, status labels, figure captions, files and security policy.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

const site = join(import.meta.dir, "..", "..", "site");
const index = await Bun.file(join(site, "index.html")).text();
const compare = await Bun.file(join(site, "compare.html")).text();
const notFound = await Bun.file(join(site, "404.html")).text();

/** What the checks below read from a page: every element's attributes, each figure's kind and caption, each status label. */
interface PageParts {
  attributes: Map<string, string>[];
  figures: { drawn: boolean; shot: boolean; caption: string }[];
  statuses: { classes: string; text: string }[];
  scripts: string[];
  styles: string[];
}

async function readPage(html: string): Promise<PageParts> {
  const read: PageParts = {
    attributes: [],
    figures: [],
    statuses: [],
    scripts: [],
    styles: [],
  };
  const figure = () => read.figures.at(-1)!;
  await new HTMLRewriter()
    .on("*", {
      element: (el) => void read.attributes.push(new Map(el.attributes)),
    })
    .on("figure", {
      element: () =>
        void read.figures.push({ drawn: false, shot: false, caption: "" }),
    })
    .on("figure .app", { element: () => void (figure().drawn = true) })
    .on("figure img, figure video", {
      element: () => void (figure().shot = true),
    })
    .on("figcaption", { text: (t) => void (figure().caption += t.text) })
    .on(".status", {
      element: (el) =>
        void read.statuses.push({
          classes: el.getAttribute("class") ?? "",
          text: "",
        }),
      text: (t) => void (read.statuses.at(-1)!.text += t.text),
    })
    .on("script:not([type])", {
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
const valuesIn = (read: PageParts, name: string): string[] =>
  read.attributes.flatMap((a) => a.get(name) ?? []);
const valuesOf = (name: string): string[] => valuesIn(page, name);

test("every in-page link and reference on each page names an element on it", () => {
  const missing = Object.entries(PAGES).flatMap(([file, read]) => {
    const ids = new Set(valuesIn(read, "id"));
    const named = [
      ...valuesIn(read, "href")
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

test("every link from one page to another names a page of the site and an element on it", () => {
  // a link to a page has no rel; a preloaded font has one
  const links = Object.values(PAGES).flatMap((read) =>
    read.attributes
      .filter((a) => !a.has("rel"))
      .flatMap((a) => a.get("href") ?? [])
      .filter((href) => !/^[a-z]+:/.test(href) && !href.startsWith("#")),
  );
  const missing = links.filter((href) => {
    const [path = "", id] = href.split("#");
    const target = PAGES[path === "./" ? "index.html" : path];
    return (
      !target || (id !== undefined && !valuesIn(target, "id").includes(id))
    );
  });
  expect(links).toContain("compare.html");
  expect(links).toContain("./#compare");
  expect(missing).toEqual([]);
});

test("every status label on each page is In the demo, Being built or Planned", () => {
  const LABELS: Record<string, string> = {
    "status status-demo": "In the demo",
    "status status-built": "Being built",
    "status status-planned": "Planned",
  };
  expect(
    Object.values(PAGES)
      .flatMap((read) => read.statuses)
      .filter(({ classes, text }) => LABELS[classes] !== text.trim()),
  ).toEqual([]);
});

test("every drawn picture on the landing page is captioned as a design mock-up, and every screenshot as the demo", () => {
  expect(
    page.figures
      .filter(({ drawn, shot, caption }) =>
        drawn
          ? !caption.includes("Design mock-up.")
          : !shot || !/(Screenshot|Recording) of the demo/.test(caption),
      )
      .map(({ caption }) => caption.trim()),
  ).toEqual([]);
});

test("every file the landing page loads is in the site folder", async () => {
  const local = [
    ...valuesOf("src"),
    ...valuesOf("srcset"),
    ...valuesOf("poster"),
    ...page.attributes
      .filter((a) => a.get("rel") === "preload")
      .map((a) => a.get("href") ?? ""),
  ];
  const missing: string[] = [];
  for (const path of local)
    if (/^[a-z]+:/.test(path) || !(await Bun.file(join(site, path)).exists()))
      missing.push(path);
  expect(missing).toEqual([]);
});

/** The CSP source for an inline block of `text`. */
const hashOf = (text: string): string =>
  `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

test("each page's content security policy allows its own inline script and style, and nothing else inline", async () => {
  const found = await Promise.all(
    [index, compare, notFound].map(async (html) => {
      const read = await readPage(html);
      const directives = (
        read.attributes
          .find((a) => a.get("http-equiv") === "Content-Security-Policy")
          ?.get("content") ?? ""
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
        inline: [
          "default-src 'none'",
          read.scripts.length === 0
            ? "script-src 'none'"
            : `script-src ${read.scripts.map(hashOf).join(" ")}`,
          `style-src ${read.styles.map(hashOf).join(" ")}`,
        ],
      };
    }),
  );
  expect(found.map(({ policy }) => policy)).toEqual(
    found.map(({ inline }) => inline),
  );
});

test("the landing page's structured data is JSON", () => {
  const data = index.match(
    new RegExp('<script type="application/ld\\+json">([\\s\\S]*?)</script>'),
  )?.[1];
  const parsed: unknown = JSON.parse(data ?? "");
  expect(parsed).toMatchObject({ "@context": "https://schema.org" });
});
