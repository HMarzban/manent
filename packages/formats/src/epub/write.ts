// Pure-TypeScript offline EPUB 3 (.epub) writer via fflate: uncompressed mimetype first, container, OPF, nav TOC, chapters and assets.
import { strToU8, zipSync } from "fflate";
import type { Zippable } from "fflate";
import { extractFootnotes } from "../script/footnotes.ts";
import type { ScriptForExport } from "../script/model.ts";
import { EPUB_BOOK_CSS } from "./css.ts";
import { escapeXhtml, renderChapterXhtml } from "./xhtml.ts";
import type { ChapterItem, EpubImageRef } from "./xhtml.ts";

export interface EpubAsset {
  readonly mime: "image/png" | "image/jpeg" | "image/webp";
  readonly bytes: Uint8Array;
}

export interface EpubOptions {
  readonly language?: string;
  readonly author?: string;
  readonly identifier?: string;
  readonly modifiedAt?: number;
  readonly assets?: ReadonlyMap<string, EpubAsset>;
}

const MIME_EXT: Readonly<Record<EpubAsset["mime"], string>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
});

function isoUtcSeconds(epochMs: number): string {
  const safe = Number.isFinite(epochMs) && epochMs >= 0 ? epochMs : 0;
  return new Date(safe).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function blockPlainText(item: ChapterItem): string {
  return (item.block.content ?? [])
    .map((node) => (node.type === "text" ? node.text : ""))
    .join("")
    .trim();
}

interface ChapterGroup {
  readonly fileName: string;
  readonly id: string;
  readonly title: string;
  readonly items: ChapterItem[];
}

function splitChapters(script: ScriptForExport): ChapterGroup[] {
  const bookTitle = script.title.trim() === "" ? "Untitled Book" : script.title;
  const groups: ChapterGroup[] = [];
  let current: ChapterGroup | null = null;

  for (let i = 0; i < script.blocks.length; i++) {
    const block = script.blocks[i]!;
    const type =
      typeof block.attrs?.type === "string" ? block.attrs.type : "body";
    if (type === "group") continue;
    const item: ChapterItem = { block, blockIndex: i };
    if (type === "chapter") {
      const heading = blockPlainText(item);
      const index = groups.length + 1;
      current = {
        id: `ch-${String(index).padStart(3, "0")}`,
        fileName: `chapter-${String(index).padStart(3, "0")}.xhtml`,
        title: heading === "" ? `Chapter ${index}` : heading,
        items: [item],
      };
      groups.push(current);
      continue;
    }
    if (current === null) {
      current = {
        id: "ch-000",
        fileName: "chapter-000.xhtml",
        title: bookTitle,
        items: [],
      };
      groups.push(current);
    }
    current.items.push(item);
  }

  if (groups.length === 0) {
    groups.push({
      id: "ch-001",
      fileName: "chapter-001.xhtml",
      title: bookTitle,
      items: [],
    });
  }
  return groups;
}

function containerXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
    "  <rootfiles>\n" +
    '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n' +
    "  </rootfiles>\n" +
    "</container>\n"
  );
}

function navXhtml(
  title: string,
  language: string,
  chapters: readonly ChapterGroup[],
): string {
  const listItems = chapters
    .map(
      (ch) =>
        `      <li><a href="xhtml/${escapeXhtml(ch.fileName)}">${escapeXhtml(ch.title)}</a></li>`,
    )
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXhtml(language)}" lang="${escapeXhtml(language)}">\n` +
    "<head>\n" +
    `<title>${escapeXhtml(title)}</title>\n` +
    '<link rel="stylesheet" type="text/css" href="styles/book.css"/>\n' +
    "</head>\n" +
    "<body>\n" +
    '  <nav epub:type="toc" id="toc">\n' +
    `    <h1>${escapeXhtml(title)}</h1>\n` +
    "    <ol>\n" +
    `${listItems}\n` +
    "    </ol>\n" +
    "  </nav>\n" +
    "</body>\n" +
    "</html>\n"
  );
}

function contentOpf(options: {
  readonly identifier: string;
  readonly title: string;
  readonly language: string;
  readonly author: string | null;
  readonly modified: string;
  readonly chapters: readonly ChapterGroup[];
  readonly images: readonly (EpubImageRef & { readonly id: string })[];
}): string {
  const manifestItems = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="css" href="styles/book.css" media-type="text/css"/>',
    ...options.chapters.map(
      (ch) =>
        `    <item id="${ch.id}" href="xhtml/${escapeXhtml(ch.fileName)}" media-type="application/xhtml+xml"/>`,
    ),
    ...options.images.map(
      (img) =>
        `    <item id="${img.id}" href="images/${escapeXhtml(img.fileName)}" media-type="${img.mime}"/>`,
    ),
  ].join("\n");

  const spineItems = options.chapters
    .map((ch) => `    <itemref idref="${ch.id}"/>`)
    .join("\n");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">\n' +
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    `    <dc:identifier id="book-id">${escapeXhtml(options.identifier)}</dc:identifier>\n` +
    `    <dc:title>${escapeXhtml(options.title)}</dc:title>\n` +
    `    <dc:language>${escapeXhtml(options.language)}</dc:language>\n` +
    (options.author !== null && options.author.trim() !== ""
      ? `    <dc:creator>${escapeXhtml(options.author.trim())}</dc:creator>\n`
      : "") +
    `    <meta property="dcterms:modified">${options.modified}</meta>\n` +
    "  </metadata>\n" +
    "  <manifest>\n" +
    `${manifestItems}\n` +
    "  </manifest>\n" +
    "  <spine>\n" +
    `${spineItems}\n` +
    "  </spine>\n" +
    "</package>\n"
  );
}

/** Writes `script` as a valid offline EPUB 3 archive with uncompressed `mimetype` first, TOC, chapters, footnotes and images. */
export function writeEpub(
  script: ScriptForExport,
  options?: EpubOptions,
): Uint8Array<ArrayBuffer> {
  const language = options?.language?.trim() || "en";
  const title = script.title.trim() === "" ? "Untitled Book" : script.title;
  const identifier =
    options?.identifier?.trim() ||
    `urn:manent:book:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "book"}`;
  const modified = isoUtcSeconds(options?.modifiedAt ?? 0);
  const chapters = splitChapters(script);
  const footnotes = extractFootnotes(script.blocks);

  const imageRefs = new Map<string, EpubImageRef>();
  const manifestImages: (EpubImageRef & { readonly id: string })[] = [];
  if (options?.assets !== undefined) {
    let imgIdx = 0;
    for (const block of script.blocks) {
      if (block.attrs?.type !== "graphic") continue;
      const g = block.attrs.graphic;
      if (g === null || g === undefined || typeof g !== "object") continue;
      const assetId = g.assetId;
      if (typeof assetId !== "string" || imageRefs.has(assetId)) continue;
      const asset = options.assets.get(assetId);
      if (asset === undefined) continue;
      imgIdx++;
      const ext = MIME_EXT[asset.mime];
      const fileName = `img-${String(imgIdx).padStart(3, "0")}.${ext}`;
      const ref: EpubImageRef = { fileName, mime: asset.mime };
      imageRefs.set(assetId, ref);
      manifestImages.push({ ...ref, id: `img-${imgIdx}` });
    }
  }

  // Per EPUB OCF 3.2: `mimetype` MUST be the first entry in the zip and stored uncompressed (`level: 0`).
  const entries: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(containerXml()),
    "OEBPS/content.opf": strToU8(
      contentOpf({
        identifier,
        title,
        language,
        author: options?.author ?? null,
        modified,
        chapters,
        images: manifestImages,
      }),
    ),
    "OEBPS/nav.xhtml": strToU8(navXhtml(title, language, chapters)),
    "OEBPS/styles/book.css": strToU8(EPUB_BOOK_CSS),
  };

  for (const chapter of chapters) {
    entries[`OEBPS/xhtml/${chapter.fileName}`] = strToU8(
      renderChapterXhtml({
        title: chapter.title,
        language,
        items: chapter.items,
        endingAt: footnotes.endingAt,
        images: imageRefs,
      }),
    );
  }

  for (const [assetId, ref] of imageRefs) {
    const asset = options!.assets!.get(assetId)!;
    entries[`OEBPS/images/${ref.fileName}`] = [asset.bytes, { level: 0 }];
  }

  return new Uint8Array(zipSync(entries));
}
