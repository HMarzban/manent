// Deterministic cache-busting stamper for static pages under site/.
// Stamps ?v=<8-char-sha256> onto local CSS and HTML asset references idempotently.
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const SITE_ORIGIN = "https://hmarzban.github.io/manent/";
export const SITE_BASE_PATH = "/manent/";

const LINK_RELS = new Set([
  "stylesheet",
  "preload",
  "icon",
  "apple-touch-icon",
]);
const JSON_LD_KEYS = new Set([
  "image",
  "screenshot",
  "thumbnailUrl",
  "contentUrl",
]);
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const CSS_URL_RE = new RegExp(
  "url\\(\\s*(?:\"([^\"]*)\"|'([^']*)'|([^)'\"\\s]+))\\s*\\)",
  "g",
);
const TAG_RE = new RegExp(
  "<!--[\\s\\S]*?-->|<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^\"'>]|\"[^\"]*\"|'[^']*')*)/?>",
  "g",
);
const ATTR_RE = new RegExp(
  "([a-zA-Z0-9:-]+)(?:\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>]+)))?",
  "g",
);
const JSON_STR_RE = new RegExp('"(?:\\\\.|[^"\\\\])*"', "g");

type SpanEdit = { start: number; end: number; text: string };
type ParsedAttr = { value: string; start: number; end: number };

/** First 8 hex characters of SHA-256 over `bytes`. */
export const hashBytes = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex").slice(0, 8);

/** First 8 hex characters of SHA-256 for the file at `filePath`. */
export const hashFile = async (filePath: string): Promise<string> =>
  hashBytes(new Uint8Array(await Bun.file(filePath).arrayBuffer()));

function splitRef(ref: string): { path: string; query: string; hash: string } {
  const h = ref.indexOf("#");
  const head = h >= 0 ? ref.slice(0, h) : ref;
  const q = head.indexOf("?");
  return {
    path: q >= 0 ? head.slice(0, q) : head,
    query: q >= 0 ? head.slice(q) : "",
    hash: h >= 0 ? ref.slice(h) : "",
  };
}

/** Removes any `v` query parameter while keeping other query params and `#fragment`. */
export function stripStamp(ref: string): string {
  const { path, query, hash } = splitRef(ref);
  if (!query) return ref;
  const params = new URLSearchParams(query.slice(1));
  params.delete("v");
  const rest = params.toString();
  return `${path}${rest ? `?${rest}` : ""}${hash}`;
}

/** Returns the `v` query parameter from `ref`, or `null` when unstamped. */
export function stampOf(ref: string): string | null {
  const { query } = splitRef(ref);
  return query ? new URLSearchParams(query.slice(1)).get("v") : null;
}

/** Applies `?v=<hashHex>` before any `#fragment`, replacing any existing `v` parameter. */
export function applyStamp(ref: string, hashHex: string): string {
  const { path, query, hash } = splitRef(ref);
  const params = new URLSearchParams(query.slice(1));
  params.set("v", hashHex);
  return `${path}?${params.toString()}${hash}`;
}

const insideDir = (root: string, target: string): boolean => {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

function resolveHtmlAsset(
  ref: string,
  siteDir: string,
  allowOrigin: boolean,
): string | null {
  const raw = splitRef(ref).path;
  if (!raw || raw.startsWith("data:") || raw.startsWith("//")) return null;
  let rel: string;
  if (raw.startsWith(SITE_ORIGIN)) {
    if (!allowOrigin) return null;
    rel = raw.slice(SITE_ORIGIN.length);
  } else if (raw.startsWith(SITE_BASE_PATH)) {
    rel = raw.slice(SITE_BASE_PATH.length);
  } else if (SCHEME_RE.test(raw)) {
    return null;
  } else {
    rel = raw;
  }
  if (!rel || rel === "./" || rel.endsWith("/") || rel.endsWith(".html"))
    return null;
  const resolved = resolve(siteDir, rel);
  return insideDir(siteDir, resolved) ? resolved : null;
}

async function cachedHash(
  filePath: string,
  cache: Map<string, string>,
  overrides?: ReadonlyMap<string, Uint8Array>,
): Promise<string> {
  const hit = cache.get(filePath);
  if (hit !== undefined) return hit;
  let bytes = overrides?.get(filePath);
  if (bytes === undefined) {
    const file = Bun.file(filePath);
    if (!(await file.exists()))
      throw new Error(`Missing local asset: ${filePath}`);
    bytes = new Uint8Array(await file.arrayBuffer());
  }
  const hash = hashBytes(bytes);
  cache.set(filePath, hash);
  return hash;
}

function applyEdits(source: string, edits: readonly SpanEdit[]): string {
  if (edits.length === 0) return source;
  let out = "";
  let pos = 0;
  for (const e of edits.toSorted((a, b) => a.start - b.start)) {
    out += source.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  return out + source.slice(pos);
}

/** Stamps local relative `url(...)` references inside a CSS file. */
export async function stampCss(
  css: string,
  cssPath: string,
  siteDir: string,
  cache: Map<string, string> = new Map(),
): Promise<string> {
  const root = resolve(siteDir);
  const base = dirname(resolve(cssPath));
  const edits: SpanEdit[] = [];
  for (const m of css.matchAll(CSS_URL_RE)) {
    const quote = m[1] !== undefined ? '"' : m[2] !== undefined ? "'" : "";
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw || /^(data:|#|\/\/)/i.test(raw) || SCHEME_RE.test(raw)) continue;
    const resolved = resolve(base, splitRef(raw).path);
    if (!insideDir(root, resolved)) continue;
    const stamped = applyStamp(raw, await cachedHash(resolved, cache));
    if (stamped !== raw)
      edits.push({
        start: m.index!,
        end: m.index! + m[0].length,
        text: `url(${quote}${stamped}${quote})`,
      });
  }
  return applyEdits(css, edits);
}

function collectJsonLdUrls(
  node: unknown,
  out: Set<string>,
  media = false,
): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdUrls(item, out, media);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const hit =
      k === "primaryImageOfPage" ||
      JSON_LD_KEYS.has(k) ||
      (media && k === "url");
    if (hit && typeof v === "string") out.add(v);
    else collectJsonLdUrls(v, out, hit);
  }
}

async function stampJsonLd(
  body: string,
  offset: number,
  siteDir: string,
  cache: Map<string, string>,
  overrides?: ReadonlyMap<string, Uint8Array>,
): Promise<SpanEdit[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const urls = new Set<string>();
  collectJsonLdUrls(parsed, urls);
  const map = new Map<string, string>();
  for (const url of urls) {
    const resolved = resolveHtmlAsset(url, siteDir, true);
    if (!resolved) continue;
    const stamped = applyStamp(
      url,
      await cachedHash(resolved, cache, overrides),
    );
    if (stamped !== url) map.set(JSON.stringify(url), JSON.stringify(stamped));
  }
  if (map.size === 0) return [];
  const edits: SpanEdit[] = [];
  for (const m of body.matchAll(JSON_STR_RE)) {
    const next = map.get(m[0]);
    if (next !== undefined)
      edits.push({
        start: offset + m.index!,
        end: offset + m.index! + m[0].length,
        text: next,
      });
  }
  return edits;
}

function parseAttrs(raw: string, baseOffset: number): Map<string, ParsedAttr> {
  const attrs = new Map<string, ParsedAttr>();
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1]!.toLowerCase();
    const value = m[2] ?? m[3] ?? m[4];
    if (value === undefined) {
      attrs.set(name, { value: "", start: -1, end: -1 });
      continue;
    }
    const start =
      baseOffset + m.index! + m[0].indexOf(value, m[0].indexOf("=") + 1);
    attrs.set(name, { value, start, end: start + value.length });
  }
  return attrs;
}

function targetAttr(
  tag: string,
  attrs: ReadonlyMap<string, ParsedAttr>,
): { attr: ParsedAttr; allowOrigin: boolean } | null {
  const pick = (name: string, allowOrigin = false) => {
    const attr = attrs.get(name);
    return attr && attr.start >= 0 ? { attr, allowOrigin } : null;
  };
  if (tag === "html") return pick("data-m-sprite");
  if (tag === "link")
    return LINK_RELS.has(attrs.get("rel")?.value.toLowerCase() ?? "")
      ? pick("href")
      : null;
  if (tag === "script" || tag === "source" || tag === "track" || tag === "img")
    return pick("src");
  if (tag === "use") return pick("href");
  if (tag === "video") return pick("poster");
  if (tag === "meta") {
    const k =
      attrs.get("property")?.value.toLowerCase() ??
      attrs.get("name")?.value.toLowerCase();
    return k === "og:image" || k === "twitter:image"
      ? pick("content", true)
      : null;
  }
  return tag === "a" && attrs.has("data-watch") ? pick("href") : null;
}

/** Stamps all mutable local asset URLs inside an HTML document. */
export async function stampHtml(
  html: string,
  siteDir: string,
  cache: Map<string, string> = new Map(),
  overrides?: ReadonlyMap<string, Uint8Array>,
): Promise<string> {
  const root = resolve(siteDir);
  const edits: SpanEdit[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html)) !== null) {
    if (!m[1]) continue;
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2] ?? "", m.index + 1 + m[1].length);
    const target = targetAttr(tag, attrs);
    if (target) {
      const resolved = resolveHtmlAsset(
        target.attr.value,
        root,
        target.allowOrigin,
      );
      if (resolved) {
        const stamped = applyStamp(
          target.attr.value,
          await cachedHash(resolved, cache, overrides),
        );
        if (stamped !== target.attr.value)
          edits.push({
            start: target.attr.start,
            end: target.attr.end,
            text: stamped,
          });
      }
    }
    if (tag === "script" || tag === "style") {
      const start = TAG_RE.lastIndex;
      const close = new RegExp(`</${tag}\\s*>`, "i").exec(html.slice(start));
      const end = close ? start + close.index : html.length;
      if (
        tag === "script" &&
        attrs.get("type")?.value.toLowerCase() === "application/ld+json"
      )
        edits.push(
          ...(await stampJsonLd(
            html.slice(start, end),
            start,
            root,
            cache,
            overrides,
          )),
        );
      TAG_RE.lastIndex = close ? end + close[0].length : html.length;
    }
  }
  return applyEdits(html, edits);
}

const listByExt = (dir: string, ext: string): Promise<string[]> =>
  readdir(dir, { withFileTypes: true })
    .then((xs) =>
      xs
        .filter((e) => e.isFile() && e.name.endsWith(ext))
        .map((e) => e.name)
        .toSorted(),
    )
    .catch(() => []);

/** Stamps `siteDir/assets/*.css` first, then every `*.html` directly under `siteDir`. */
export async function stampSite(
  siteDir: string,
  options: { check?: boolean } = {},
): Promise<{ changed: string[]; files: string[] }> {
  const root = resolve(siteDir);
  const check = options.check ?? false;
  const changed: string[] = [];
  const files: string[] = [];
  const cssCache = new Map<string, string>();
  const overrides = new Map<string, Uint8Array>();

  const assetsDir = join(root, "assets");
  for (const name of await listByExt(assetsDir, ".css")) {
    const p = join(assetsDir, name);
    files.push(`assets/${name}`);
    const orig = await Bun.file(p).text();
    const next = await stampCss(orig, p, root, cssCache);
    if (next !== orig) {
      changed.push(`assets/${name}`);
      if (check) overrides.set(p, new TextEncoder().encode(next));
      else await Bun.write(p, next);
    }
  }

  const htmlCache = new Map<string, string>();
  for (const name of await listByExt(root, ".html")) {
    const p = join(root, name);
    files.push(name);
    const orig = await Bun.file(p).text();
    const next = await stampHtml(orig, root, htmlCache, overrides);
    if (next !== orig) {
      changed.push(name);
      if (!check) await Bun.write(p, next);
    }
  }
  return { changed, files };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const dir = resolve(
    args.find((a) => !a.startsWith("-")) ?? join(import.meta.dir, "..", "site"),
  );
  const { changed, files } = await stampSite(dir, { check });
  if (check && changed.length > 0) {
    console.log(
      `stamp-site: ${changed.length} file(s) need updating: ${changed.join(", ")}`,
    );
    process.exit(1);
  }
  console.log(
    `stamp-site: checked ${files.length} file(s), updated ${changed.length}`,
  );
}
