// Pure-TypeScript lossless Markdown (.md) writer for Book manuscripts and scripts.
import type { BookBackMatter, BookFrontMatter } from "../book/matter.ts";
import { extractFootnotes } from "../script/footnotes.ts";
import type { ScriptForExport } from "../script/model.ts";
import { renderMarkdownRuns } from "./inline.ts";

export interface MarkdownWriteOptions {
  readonly frontMatter?: BookFrontMatter;
  readonly backMatter?: BookBackMatter;
}

function yamlEscape(value: string): string {
  const singleLine = value.replace(/\r?\n/g, " ").trim();
  const escaped = singleLine.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

function frontMatterYaml(front: BookFrontMatter | undefined): string {
  if (front === undefined) return "";
  const pairs: [string, string][] = [];
  const add = (key: string, value: string | undefined): void => {
    const clean = (value ?? "").trim();
    if (clean !== "") pairs.push([key, yamlEscape(clean)]);
  };
  add("title", front.title);
  add("subtitle", front.subtitle);
  add("author", front.author);
  add("isbn", front.isbn);
  add("copyright", front.copyright);
  add("dedication", front.dedication);
  if (pairs.length === 0) return "";
  return `---\n${pairs.map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n`;
}

/** Serialises `script` as clean, pandoc/Markdown-compatible `.md` text with optional YAML front matter, footnotes and back matter. */
export function writeMarkdown(
  script: ScriptForExport,
  options?: MarkdownWriteOptions,
): string {
  const footnotes = extractFootnotes(script.blocks);
  const parts: string[] = [];

  for (let i = 0; i < script.blocks.length; i++) {
    const block = script.blocks[i]!;
    const attrs = block.attrs ?? {};
    const type = typeof attrs.type === "string" ? attrs.type : "body";
    if (type === "group") continue;
    if (type === "page_break") {
      parts.push("<!-- pagebreak -->");
      continue;
    }
    if (type === "break") {
      parts.push("***");
      continue;
    }
    if (type === "graphic") {
      const g =
        typeof attrs.graphic === "object" && attrs.graphic !== null
          ? attrs.graphic
          : null;
      const alt = typeof g?.alt === "string" ? g.alt : "";
      const ref = typeof g?.assetId === "string" ? g.assetId : "";
      const caption = renderMarkdownRuns(block.content, i, footnotes.endingAt);
      const titlePart =
        caption !== "" ? ` "${caption.replaceAll('"', '\\"')}"` : "";
      parts.push(`![${alt}](${ref}${titlePart})`);
      continue;
    }

    const line = renderMarkdownRuns(block.content, i, footnotes.endingAt);
    if (type === "chapter") {
      parts.push(`# ${line}`);
    } else if (type === "subheading") {
      parts.push(`## ${line}`);
    } else if (type === "epigraph") {
      parts.push(`> *${line}*`);
    } else if (type === "quote") {
      parts.push(`> ${line}`);
    } else {
      parts.push(line);
    }
  }

  const back = options?.backMatter;
  if (back !== undefined) {
    const ack = (back.acknowledgments ?? "").trim();
    if (ack !== "") parts.push(`# Acknowledgements\n\n${ack}`);
    const about = (back.aboutAuthor ?? "").trim();
    if (about !== "") parts.push(`# About the author\n\n${about}`);
  }

  if (footnotes.notes.length > 0) {
    const defs = footnotes.notes
      .map((note) => `[^${note.ordinal}]: ${note.text}`)
      .join("\n");
    parts.push(defs);
  }

  const header = frontMatterYaml(options?.frontMatter);
  return `${header}${parts.join("\n\n")}\n`;
}
