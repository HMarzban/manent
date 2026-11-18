// The conformance page: paragraphs drawn with the production styles and fonts, their rendered line starts
// compared with the engine's.
import { STYLE, fontRanges, profileFor, wrap } from "@manent/pagination";
import type { SpecKey } from "@manent/pagination";
import {
  PAGE_CSS,
  faceDescriptors,
  loadScriptFonts,
  profileCss,
} from "@manent/editor";
import { domLineStarts } from "./dom-lines.ts";

export interface ConformanceItem {
  readonly key: SpecKey;
  readonly text: string;
  readonly style: number;
}

/** An item whose rendered line starts are not the model's; `index` is its place in the run's items. */
export interface LineDifference {
  readonly index: number;
  readonly dom: number[];
  readonly model: number[];
}

interface RunInput {
  readonly format: string;
  /** Percent. */
  readonly zoom: number;
  readonly items: ConformanceItem[];
}

export interface Conformance {
  readonly ready: Promise<"ready" | "fallback">;
  /** The items that differ. */
  run(input: RunInput): LineDifference[];
  /** Px at 100 % of ten "M" in regular, bold, italic and bold italic. */
  advances(): number[];
  /** Px at 100 % of one line. */
  width(text: string, style: number): number;
}

declare global {
  interface Window {
    __conf: Conformance;
  }
}

const BATCH = 200;

async function loadFonts(): Promise<"ready" | "fallback"> {
  const faces: FontFace[] = [];
  const state = await loadScriptFonts({
    fonts: document.fonts,
    makeFace: (d) => {
      const face = new FontFace(d.family, `url(${d.source}) format("woff2")`, {
        weight: d.weight,
        style: d.style,
        unicodeRange: d.unicodeRange,
        display: d.display,
      });
      faces.push(face);
      return face;
    },
    faces: faceDescriptors(fontRanges("latin"), fontRanges("latin-ext")),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  if (state === "fallback") return state;
  // a `latin-ext` face loads on first use, after the line holding it is measured, so all load up front
  try {
    await Promise.all(faces.map((face) => face.load()));
    return "ready";
  } catch {
    return "fallback";
  }
}

function element(
  tag: string,
  className: string,
  ...children: Node[]
): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.append(...children);
  return el;
}

function styled(text: string, style: number): Node {
  let node: Node = document.createTextNode(text);
  if ((style & STYLE.ITALIC) !== 0) node = element("em", "", node);
  if ((style & STYLE.BOLD) !== 0) node = element("strong", "", node);
  return node;
}

// A block's class carries its type; an act break's kind is not part of it.
function paragraph(item: ConformanceItem): HTMLElement {
  const type = item.key.split(".")[0]!;
  return element("p", `el el-${type}`, styled(item.text, item.style));
}

function pageRoot(...children: Node[]): HTMLElement {
  const root = element(
    "div",
    "mn-pages",
    element("div", "mn-page-view", ...children),
  );
  document.body.append(root);
  return root;
}

const sameStarts = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((start, i) => start === b[i]);

const pageStyle = document.createElement("style");
pageStyle.textContent = PAGE_CSS;
const profileStyle = document.createElement("style");
document.head.append(pageStyle, profileStyle);
const section = element("div", "section");
const lines = pageRoot(section);
const ruler = element("span", "");
pageRoot(ruler);

function run(input: RunInput): LineDifference[] {
  const profile = profileFor(input.format);
  if (profile === null)
    throw new RangeError(`the format ${input.format} has no pages`);
  profileStyle.textContent = profileCss(profile);
  lines.style.transform = `scale(${input.zoom / 100})`;
  const differences: LineDifference[] = [];
  for (let first = 0; first < input.items.length; first += BATCH) {
    const batch = input.items.slice(first, first + BATCH);
    const drawn = batch.map(paragraph);
    section.replaceChildren(...drawn);
    batch.forEach((item, i) => {
      const spec = profile.elements[item.key];
      const dom = domLineStarts(drawn[i]!);
      const model = Array.from(
        wrap(item.text, spec.width, {
          firstLineIndent: spec.firstLineIndent,
          capitalized: spec.capitalized,
        }),
      );
      if (!sameStarts(dom, model))
        differences.push({ index: first + i, dom, model });
    });
  }
  section.replaceChildren();
  return differences;
}

function width(text: string, style: number): number {
  ruler.replaceChildren(styled(text, style));
  return ruler.getBoundingClientRect().width;
}

// brackets, as the lint refuses a member name that begins with an underscore
window["__conf"] = {
  ready: loadFonts(),
  run,
  advances: () =>
    [0, STYLE.BOLD, STYLE.ITALIC, STYLE.BOLD | STYLE.ITALIC].map((style) =>
      width("M".repeat(10), style),
    ),
  width,
};
