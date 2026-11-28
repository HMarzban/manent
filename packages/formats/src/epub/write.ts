// Pure-TypeScript offline EPUB 3 (.epub) writer via fflate: uncompressed mimetype first, container, OPF, cover, front/back matter, nested nav TOC, chapters and assets.
import { strToU8, zipSync } from "fflate";
import type { Zippable } from "fflate";
import type { BookBackMatter, BookFrontMatter } from "../book/matter.ts";
import { extractFootnotes } from "../script/footnotes.ts";
import type { ScriptForExport } from "../script/model.ts";
import { EPUB_BOOK_CSS } from "./css.ts";
import {
  buildEpubMatterPages,
  renderCoverXhtml,
  renderNavXhtml,
} from "./matter.ts";
import type { EpubMatterPage, EpubTocSubheading } from "./matter.ts";
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
  readonly cover?: EpubAsset | null;
  readonly frontMatter?: BookFrontMatter;
  readonly backMatter?: BookBackMatter;
  readonly includeTocInSpine?: boolean;
  readonly includeSubheadingsInToc?: boolean;
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
  readonly subheadings: EpubTocSubheading[];
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
        subheadings: [],
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
        subheadings: [],
      };
      groups.push(current);
    }
    if (type === "subheading") {
      const subTitle = blockPlainText(item);
      const subIndex = current.subheadings.length + 1;
      if (subTitle !== "") {
        current.subheadings.push({
          id: `sub-${String(subIndex).padStart(3, "0")}`,
          title: subTitle,
        });
      }
    }
    current.items.push(item);
  }

  if (groups.length === 0) {
    groups.push({
      id: "ch-001",
      fileName: "chapter-001.xhtml",
      title: bookTitle,
      items: [],
      subheadings: [],
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

function contentOpf(options: {
  readonly identifier: string;
  readonly isbn: string | null;
  readonly title: string;
  readonly language: string;
  readonly author: string | null;
  readonly modified: string;
  readonly coverPage: EpubMatterPage | null;
  readonly coverImage: (EpubImageRef & { readonly id: string }) | null;
  readonly frontPages: readonly EpubMatterPage[];
  readonly backPages: readonly EpubMatterPage[];
  readonly includeTocInSpine: boolean;
  readonly chapters: readonly ChapterGroup[];
  readonly images: readonly (EpubImageRef & { readonly id: string })[];
}): string {
  const manifestItems = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="css" href="styles/book.css" media-type="text/css"/>',
    ...(options.coverImage !== null
      ? [
          `    <item id="${options.coverImage.id}" href="images/${escapeXhtml(options.coverImage.fileName)}" media-type="${options.coverImage.mime}" properties="cover-image"/>`,
        ]
      : []),
    ...(options.coverPage !== null
      ? [
          `    <item id="${options.coverPage.id}" href="xhtml/${escapeXhtml(options.coverPage.fileName)}" media-type="application/xhtml+xml"/>`,
        ]
      : []),
    ...options.frontPages.map(
      (page) =>
        `    <item id="${page.id}" href="xhtml/${escapeXhtml(page.fileName)}" media-type="application/xhtml+xml"/>`,
    ),
    ...options.chapters.map(
      (ch) =>
        `    <item id="${ch.id}" href="xhtml/${escapeXhtml(ch.fileName)}" media-type="application/xhtml+xml"/>`,
    ),
    ...options.backPages.map(
      (page) =>
        `    <item id="${page.id}" href="xhtml/${escapeXhtml(page.fileName)}" media-type="application/xhtml+xml"/>`,
    ),
    ...options.images.map(
      (img) =>
        `    <item id="${img.id}" href="images/${escapeXhtml(img.fileName)}" media-type="${img.mime}"/>`,
    ),
  ].join("\n");

  const spineIds = [
    ...(options.coverPage !== null ? [options.coverPage.id] : []),
    ...options.frontPages.map((p) => p.id),
    ...(options.includeTocInSpine ? ["nav"] : []),
    ...options.chapters.map((ch) => ch.id),
    ...options.backPages.map((p) => p.id),
  ];
  const spineItems = spineIds
    .map((id) => `    <itemref idref="${id}"/>`)
    .join("\n");

  const cleanIsbn = options.isbn?.replace(/[^0-9Xx-]/g, "") ?? "";

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">\n' +
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    `    <dc:identifier id="book-id">${escapeXhtml(options.identifier)}</dc:identifier>\n` +
    (cleanIsbn !== ""
      ? `    <dc:identifier id="isbn">urn:isbn:${escapeXhtml(cleanIsbn)}</dc:identifier>\n`
      : "") +
    `    <dc:title>${escapeXhtml(options.title)}</dc:title>\n` +
    `    <dc:language>${escapeXhtml(options.language)}</dc:language>\n` +
    (options.author !== null && options.author.trim() !== ""
      ? `    <dc:creator>${escapeXhtml(options.author.trim())}</dc:creator>\n`
      : "") +
    (options.coverImage !== null
      ? `    <meta name="cover" content="${options.coverImage.id}"/>\n`
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

/** Writes `script` as a valid offline EPUB 3 archive with uncompressed `mimetype` first, cover, front/back matter, nested TOC, chapters, footnotes and images. */
export function writeEpub(
  script: ScriptForExport,
  options?: EpubOptions,
): Uint8Array<ArrayBuffer> {
  const language = options?.language?.trim() || "en";
  const frontTitle = options?.frontMatter?.title?.trim() ?? "";
  const title =
    frontTitle !== ""
      ? frontTitle
      : script.title.trim() === ""
        ? "Untitled Book"
        : script.title;
  const author =
    options?.author?.trim() || options?.frontMatter?.author?.trim() || null;
  const isbn = options?.frontMatter?.isbn?.trim() || null;
  const identifier =
    options?.identifier?.trim() ||
    `urn:manent:book:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "book"}`;
  const modified = isoUtcSeconds(options?.modifiedAt ?? 0);
  const chapters = splitChapters(script);
  const footnotes = extractFootnotes(script.blocks);
  const { frontPages, backPages } = buildEpubMatterPages(
    title,
    language,
    options?.frontMatter,
    options?.backMatter,
  );

  const coverAsset = options?.cover ?? null;
  const coverImage: (EpubImageRef & { readonly id: string }) | null =
    coverAsset !== null
      ? {
          id: "cover-image",
          fileName: `cover.${MIME_EXT[coverAsset.mime]}`,
          mime: coverAsset.mime,
        }
      : null;
  const coverPage: EpubMatterPage | null =
    coverImage !== null
      ? {
          id: "cover",
          fileName: "cover.xhtml",
          title: "Cover",
          epubType: "cover",
          xhtml: renderCoverXhtml(title, language, coverImage.fileName),
        }
      : null;

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
        isbn,
        title,
        language,
        author,
        modified,
        coverPage,
        coverImage,
        frontPages,
        backPages,
        includeTocInSpine: options?.includeTocInSpine === true,
        chapters,
        images: manifestImages,
      }),
    ),
    "OEBPS/nav.xhtml": strToU8(
      renderNavXhtml({
        title,
        language,
        chapters,
        frontPages,
        backPages,
        coverFileName: coverPage?.fileName ?? null,
        includeSubheadings: options?.includeSubheadingsInToc !== false,
      }),
    ),
    "OEBPS/styles/book.css": strToU8(EPUB_BOOK_CSS),
  };

  if (coverPage !== null && coverImage !== null && coverAsset !== null) {
    entries[`OEBPS/xhtml/${coverPage.fileName}`] = strToU8(coverPage.xhtml);
    entries[`OEBPS/images/${coverImage.fileName}`] = [
      coverAsset.bytes,
      { level: 0 },
    ];
  }
  for (const page of [...frontPages, ...backPages]) {
    entries[`OEBPS/xhtml/${page.fileName}`] = strToU8(page.xhtml);
  }
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
