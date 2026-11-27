// The pages under site/: their links and references, pictures, measured figures, files, icons and security policy.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  SITE_BASE_PATH,
  hashFile,
  stampOf,
  stripStamp,
} from "../stamp-site.ts";

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
    const [rawPath = "", id] = href.split("#");
    const path = stripStamp(rawPath);
    const target = PAGES[path === "./" ? "index.html" : path];
    const found = target
      ? id === undefined || valuesIn(target, "id").includes(id)
      : id === undefined && (await Bun.file(join(site, path)).exists());
    if (!found) missing.push(href);
  }
  expect(links).toContain("compare.html");
  expect(links).toContain("./#compare");
  expect(links.map(stripStamp)).toContain("media/demo-recording.mp4");
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
            ["stylesheet", "preload", "icon", "apple-touch-icon"].includes(
              attributes.get("rel") ?? "",
            )))
          ? [href.split("#")[0]!]
          : []),
      ];
    }),
  )
    .filter((path) => path !== "" && !path.startsWith("data:"))
    .map((path) => stripStamp(path).replace(/^\/manent\//, ""));
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

const SITE_ORIGIN = "https://hmarzban.github.io/manent/";
const BANNED_WORDS = new RegExp(
  String.raw`\b(generation|rebuild|conflict|error|failed)\b`,
  "i",
);
const FDR_IMPORT_CLAIM = new RegExp(
  String.raw`\.fdr\s+files?\s+import|from\s+\.fdr|\.fdr,\s*PDF`,
  "i",
);

const readJsonLd = (html: string): Record<string, unknown> => {
  const raw = html.match(
    new RegExp('<script type="application/ld\\+json">([\\s\\S]*?)</script>'),
  )?.[1];
  expect(raw).toBeDefined();
  return JSON.parse(raw ?? "") as Record<string, unknown>;
};

const graphOf = (doc: Record<string, unknown>): Record<string, unknown>[] => {
  expect(doc["@context"]).toBe("https://schema.org");
  expect(Array.isArray(doc["@graph"])).toBe(true);
  return doc["@graph"] as Record<string, unknown>[];
};

const metaValue = (
  read: PageParts,
  attr: "name" | "property",
  key: string,
): string | undefined =>
  read.elements
    .find(
      ({ tag, attributes }) => tag === "meta" && attributes.get(attr) === key,
    )
    ?.attributes.get("content");

const textOf = async (html: string, selector: string): Promise<string[]> => {
  const out: string[] = [];
  await new HTMLRewriter()
    .on(selector, {
      element: () => void out.push(""),
      text: (t) => void (out[out.length - 1] += t.text),
    })
    .transform(new Response(html))
    .text();
  return out.map((s) => s.replace(/\s+/g, " ").trim());
};

test("robots.txt and sitemap.xml exist and point to the canonical pages", async () => {
  const robots = await Bun.file(join(site, "robots.txt")).text();
  expect(robots).toContain("User-agent: *");
  expect(robots).toContain("Allow: /");
  expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}sitemap.xml`);

  const sitemap = await Bun.file(join(site, "sitemap.xml")).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, u]) => u);
  expect(locs).toEqual([SITE_ORIGIN, `${SITE_ORIGIN}compare.html`]);
  expect(sitemap).not.toContain("404.html");
});

test("every site page has valid titles, descriptions, canonical/robots directives, OpenGraph and Twitter cards", async () => {
  const files: [string, string, PageParts, string | null][] = [
    ["index.html", index, PAGES["index.html"]!, SITE_ORIGIN],
    [
      "compare.html",
      compare,
      PAGES["compare.html"]!,
      `${SITE_ORIGIN}compare.html`,
    ],
    ["404.html", notFound, ALL[2]!, null],
  ];

  for (const [name, html, read, canonicalUrl] of files) {
    const [title = ""] = await textOf(html, "title");
    expect(title.length, `${name} <title> length`).toBeGreaterThan(0);
    expect(title.length, `${name} <title> <= 60`).toBeLessThanOrEqual(60);

    const desc = metaValue(read, "name", "description") ?? "";
    expect(desc.length, `${name} description length`).toBeGreaterThanOrEqual(
      50,
    );
    expect(desc.length, `${name} description <= 155`).toBeLessThanOrEqual(155);

    const canonical = read.elements
      .find(
        ({ tag, attributes }) =>
          tag === "link" && attributes.get("rel") === "canonical",
      )
      ?.attributes.get("href");

    if (canonicalUrl === null) {
      expect(canonical, `${name} has no canonical`).toBeUndefined();
      expect(metaValue(read, "name", "robots")).toBe("noindex, follow");
    } else {
      expect(canonical, `${name} canonical`).toBe(canonicalUrl);
      expect(metaValue(read, "property", "og:url")).toBe(canonicalUrl);
    }

    for (const prop of [
      "og:type",
      "og:site_name",
      "og:title",
      "og:description",
      "og:image",
      "og:image:width",
      "og:image:height",
      "og:image:alt",
      "og:locale",
    ]) {
      expect(metaValue(read, "property", prop), `${name} ${prop}`).toBeTruthy();
    }

    for (const key of [
      "twitter:card",
      "twitter:title",
      "twitter:description",
      "twitter:image",
      "twitter:image:alt",
    ]) {
      expect(metaValue(read, "name", key), `${name} ${key}`).toBeTruthy();
    }

    for (const imgUrl of [
      metaValue(read, "property", "og:image"),
      metaValue(read, "name", "twitter:image"),
    ]) {
      expect(imgUrl?.startsWith(SITE_ORIGIN), `${name} image origin`).toBe(
        true,
      );
      const rel = stripStamp(imgUrl!.slice(SITE_ORIGIN.length));
      expect(await Bun.file(join(site, rel)).exists(), `${name} ${rel}`).toBe(
        true,
      );
    }
  }
});

test("both index.html and compare.html carry complete, linked JSON-LD graphs", async () => {
  const indexGraph = graphOf(readJsonLd(index));
  const indexTypes = new Set(indexGraph.map((n) => n["@type"]));
  for (const type of [
    "Organization",
    "WebSite",
    "SoftwareApplication",
    "SoftwareSourceCode",
    "VideoObject",
    "FAQPage",
  ]) {
    expect(indexTypes.has(type), `index.html JSON-LD missing ${type}`).toBe(
      true,
    );
  }

  const faq = indexGraph.find((n) => n["@type"] === "FAQPage")!;
  const entities = faq.mainEntity as {
    name: string;
    acceptedAnswer: { text: string };
  }[];
  expect(entities.length).toBeGreaterThanOrEqual(8);
  const visibleQuestions = await textOf(index, "#faq summary");
  const visibleAnswers = await textOf(index, "#faq details p");
  for (const q of entities) {
    expect(visibleQuestions, "FAQ JSON-LD matches visible #faq").toContain(
      q.name,
    );
  }
  for (const name of [
    "Does it really work with no connection?",
    "Which computers does it run on?",
  ]) {
    const entry = entities.find((q) => q.name === name);
    expect(entry, `FAQ JSON-LD has ${name}`).toBeDefined();
    expect(visibleAnswers, `Visible FAQ matches JSON-LD for ${name}`).toContain(
      entry!.acceptedAnswer.text,
    );
  }

  const video = indexGraph.find((n) => n["@type"] === "VideoObject")!;
  const captions = await Bun.file(
    join(site, "media", "demo-recording.vtt"),
  ).text();
  const [, minutes = "", seconds = "", millis = ""] =
    [...captions.matchAll(/--> (\d+):(\d+)\.(\d+)/g)].at(-1) ?? [];
  const durationSec = Math.ceil(
    Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000,
  );
  expect(video.duration).toBe(`PT${durationSec}S`);

  const compareGraph = graphOf(readJsonLd(compare));
  const compareTypes = new Set(compareGraph.map((n) => n["@type"]));
  for (const type of ["WebPage", "BreadcrumbList", "SoftwareApplication"]) {
    expect(compareTypes.has(type), `compare.html JSON-LD missing ${type}`).toBe(
      true,
    );
  }
  const indexApp = indexGraph.find(
    (n) => n["@type"] === "SoftwareApplication",
  )!;
  const compareApp = compareGraph.find(
    (n) => n["@type"] === "SoftwareApplication",
  )!;
  expect(compareApp["@id"]).toBe(indexApp["@id"]);
});

test("no site page contains banned words or false .fdr import claims", () => {
  const htmlFiles: [string, string][] = [
    ["index.html", index],
    ["compare.html", compare],
    ["404.html", notFound],
  ];
  const violations: string[] = [];
  for (const [file, html] of htmlFiles) {
    for (const [i, line] of html.split(/\r?\n/).entries()) {
      const banned = BANNED_WORDS.exec(line)?.[0];
      if (banned) violations.push(`${file}:${i + 1} banned word "${banned}"`);
      const fdr = FDR_IMPORT_CLAIM.exec(line)?.[0];
      if (fdr) violations.push(`${file}:${i + 1} false .fdr claim "${fdr}"`);
    }
  }
  expect(violations).toEqual([]);
});

test("every site page has one h1, one main landmark, a skip link, and valid heading order", () => {
  for (const [name, read] of [
    ["index.html", PAGES["index.html"]!],
    ["compare.html", PAGES["compare.html"]!],
    ["404.html", ALL[2]!],
  ] as const) {
    const h1s = read.elements.filter(({ tag }) => tag === "h1");
    const mains = read.elements.filter(
      ({ tag, attributes }) =>
        tag === "main" && attributes.get("id") === "main",
    );
    const skips = read.elements.filter(
      ({ tag, attributes }) =>
        tag === "a" &&
        attributes.get("class") === "skip" &&
        attributes.get("href") === "#main",
    );
    expect(h1s.length, `${name} h1 count`).toBe(1);
    expect(mains.length, `${name} main#main count`).toBe(1);
    expect(skips.length, `${name} skip link count`).toBe(1);

    let prev = 0;
    for (const { tag } of read.elements) {
      if (!/^h[1-6]$/.test(tag)) continue;
      const level = Number(tag[1]);
      if (prev > 0) {
        expect(
          level,
          `${name} skipped heading h${prev} -> h${level}`,
        ).toBeLessThanOrEqual(prev + 1);
      }
      prev = level;
    }
  }
  // No <nav> nested inside a role="img" vignette
  expect(index).not.toContain('<nav class="mv-side">');
});

test("site.js links to shipped release artifacts and never non-existent .AppImage or .exe installers", async () => {
  const js = await Bun.file(join(site, "assets", "site.js")).text();
  expect(js).not.toMatch(/\.AppImage\b/);
  expect(js).not.toMatch(/Manent-windows\.exe\b/);
  expect(js).not.toMatch(/Manent-mac\.dmg\b/);
  expect(js).toContain("Manent-macos-arm64.dmg");
  expect(js).toContain("Manent-macos-x64.dmg");
});

test("neither index.html nor compare.html contains stale MOS refusal claims", async () => {
  const staleMos = new RegExp(
    String.raw`talk to mos|drive a particular maker`,
    "i",
  );
  const [indexMain = ""] = await textOf(index, "main");
  const [compareMain = ""] = await textOf(compare, "main");
  expect(staleMos.test(index)).toBe(false);
  expect(staleMos.test(indexMain)).toBe(false);
  expect(staleMos.test(compare)).toBe(false);
  expect(staleMos.test(compareMain)).toBe(false);

  const indexGraph = graphOf(readJsonLd(index));
  const faq = indexGraph.find((n) => n["@type"] === "FAQPage")!;
  const wont = (
    faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]
  ).find((q) => q.name === "What won't Manent do?");
  expect(wont).toBeDefined();
  expect(wont!.acceptedAnswer.text).toContain("MOS 2.8.5");
  expect(wont!.acceptedAnswer.text).toContain("Autoscript WinPlus-IP");
  expect(wont!.acceptedAnswer.text).toContain("Desktop LAN MOS relay");
  expect(wont!.acceptedAnswer.text).toContain("mock MOS prompter");
});

test("index.html and compare.html reflect Stage 5 and Ghost Follow capabilities", async () => {
  const indexGraph = graphOf(readJsonLd(index));
  const app = indexGraph.find((n) => n["@type"] === "SoftwareApplication")!;
  const features = (app.featureList as string[]).join("\n");
  const [indexMain = ""] = await textOf(index, "main");
  const [compareMain = ""] = await textOf(compare, "main");

  expect(page.measured.length).toBe(3);

  for (const needle of [
    "MOS 2.8.5",
    "Autoscript WinPlus-IP",
    "Desktop LAN MOS relay",
    "mock MOS prompter",
    "Take control",
    "Take over",
    "Stop controlling",
    "Free scroll",
    "Lower third",
    "Over the shoulder",
    "Full screen",
    "Save template…",
    "Project settings → Templates",
    "Can view",
    "In the grid",
    "Side by side",
    "As it was",
    "Ghost Follow",
    "Back to …",
  ]) {
    expect(features, `JSON-LD featureList includes "${needle}"`).toContain(
      needle,
    );
    expect(indexMain, `index.html <main> includes "${needle}"`).toContain(
      needle,
    );
    expect(compareMain, `compare.html <main> includes "${needle}"`).toContain(
      needle,
    );
  }
});

const toSiteRel = (ref: string): string => {
  const bare = stripStamp(ref).split("#")[0]!;
  if (bare.startsWith(SITE_ORIGIN)) return bare.slice(SITE_ORIGIN.length);
  if (bare.startsWith(SITE_BASE_PATH)) return bare.slice(SITE_BASE_PATH.length);
  return bare;
};

test("every mutable local asset reference across all site/*.html pages carries its exact ?v=<sha256> stamp and font preload matches site.css verbatim", async () => {
  const htmlFiles = (await readdir(site, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .toSorted();
  expect(htmlFiles).toContain("index.html");
  expect(htmlFiles).toContain("compare.html");
  expect(htmlFiles).toContain("404.html");

  const hashCache = new Map<string, string>();
  const expectedHash = async (relPath: string): Promise<string> => {
    const hit = hashCache.get(relPath);
    if (hit !== undefined) return hit;
    const hash = await hashFile(join(site, relPath));
    hashCache.set(relPath, hash);
    return hash;
  };

  const css = await Bun.file(join(site, "assets", "site.css")).text();
  const cssFontUrlRe = new RegExp(
    "url\\(['\"]?(\\.\\./fonts/[^)'\"]+)['\"]?\\)",
    "g",
  );
  const cssFontUrls = [...css.matchAll(cssFontUrlRe)].map(([, u]) =>
    u!.replace(/^\.\.\//, ""),
  );
  expect(cssFontUrls.length).toBeGreaterThan(0);
  for (const fontUrl of cssFontUrls) {
    const rel = stripStamp(fontUrl);
    expect(stampOf(fontUrl), `site.css ${fontUrl}`).toBe(
      await expectedHash(rel),
    );
  }

  const preloadFontUrls: string[] = [];
  const checkedRefs: string[] = [];

  const assertStamped = async (label: string, ref: string): Promise<void> => {
    checkedRefs.push(label);
    const rel = toSiteRel(ref);
    expect(stampOf(ref), `${label} (${ref})`).toBe(await expectedHash(rel));
  };

  for (const file of htmlFiles) {
    const html = await Bun.file(join(site, file)).text();
    const read = await readPage(html);

    for (const { tag, attributes } of read.elements) {
      if (tag === "html") {
        const spriteRef = attributes.get("data-m-sprite");
        if (spriteRef) await assertStamped(`${file} data-m-sprite`, spriteRef);
      } else if (tag === "link") {
        const rel = attributes.get("rel") ?? "";
        const href = attributes.get("href") ?? "";
        if (
          ["stylesheet", "preload", "icon", "apple-touch-icon"].includes(rel) &&
          href &&
          !href.startsWith("data:")
        ) {
          await assertStamped(`${file} link[rel=${rel}]`, href);
          if (rel === "preload" && attributes.get("as") === "font") {
            preloadFontUrls.push(
              href.startsWith(SITE_BASE_PATH)
                ? href.slice(SITE_BASE_PATH.length)
                : href,
            );
          }
        }
      } else if (tag === "script") {
        const src = attributes.get("src");
        if (src) await assertStamped(`${file} script[src]`, src);
      } else if (tag === "use") {
        const href = attributes.get("href") ?? "";
        expect(href, `${file} <use> places ?v= before #`).toMatch(
          /\?v=[0-9a-f]{8}#/,
        );
        await assertStamped(`${file} use[href]`, href);
      } else if (tag === "meta") {
        const prop = attributes.get("property");
        const name = attributes.get("name");
        const content = attributes.get("content") ?? "";
        if (prop === "og:image" || name === "twitter:image") {
          expect(
            content.startsWith(SITE_ORIGIN),
            `${file} ${prop ?? name}`,
          ).toBe(true);
          await assertStamped(`${file} ${prop ?? name}`, content);
        }
      } else if (tag === "video") {
        const poster = attributes.get("poster");
        if (poster) await assertStamped(`${file} video[poster]`, poster);
      } else if (tag === "source" || tag === "track") {
        const src = attributes.get("src");
        if (src) await assertStamped(`${file} ${tag}[src]`, src);
      } else if (tag === "a" && attributes.has("data-watch")) {
        const href = attributes.get("href") ?? "";
        await assertStamped(`${file} a[data-watch]`, href);
      }
    }

    const ldMatch = html.match(
      new RegExp('<script type="application/ld\\+json">([\\s\\S]*?)</script>'),
    );
    if (ldMatch?.[1]) {
      const graph = graphOf(JSON.parse(ldMatch[1]) as Record<string, unknown>);
      for (const node of graph) {
        for (const key of [
          "image",
          "screenshot",
          "thumbnailUrl",
          "contentUrl",
        ]) {
          const value = node[key];
          if (typeof value === "string") {
            expect(
              value.startsWith(SITE_ORIGIN),
              `${file} JSON-LD ${key}`,
            ).toBe(true);
            await assertStamped(`${file} JSON-LD ${key}`, value);
          }
        }
        const primary = node.primaryImageOfPage as
          { url?: unknown } | undefined;
        if (typeof primary?.url === "string") {
          expect(
            primary.url.startsWith(SITE_ORIGIN),
            `${file} JSON-LD primaryImageOfPage.url`,
          ).toBe(true);
          await assertStamped(
            `${file} JSON-LD primaryImageOfPage.url`,
            primary.url,
          );
        }
      }
    }
  }

  expect(checkedRefs.length).toBeGreaterThan(20);
  expect(preloadFontUrls.length).toBe(htmlFiles.length);
  for (const fontUrl of preloadFontUrls) {
    expect(cssFontUrls).toContain(fontUrl);
  }
});
