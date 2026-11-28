// EPUB 3 XHTML generators for cover, front matter (title, copyright, dedication), back matter and nested navigation/landmarks.
import type { BookBackMatter, BookFrontMatter } from "../book/matter.ts";
import { escapeXhtml } from "./xhtml.ts";

export interface EpubTocSubheading {
  readonly id: string;
  readonly title: string;
}

export interface EpubNavChapter {
  readonly fileName: string;
  readonly title: string;
  readonly subheadings: readonly EpubTocSubheading[];
}

export interface EpubMatterPage {
  readonly id: string;
  readonly fileName: string;
  readonly title: string;
  readonly epubType: string;
  readonly xhtml: string;
}

function wrapXhtml(title: string, language: string, body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXhtml(language)}" lang="${escapeXhtml(language)}">\n` +
    "<head>\n" +
    `<title>${escapeXhtml(title)}</title>\n` +
    '<link rel="stylesheet" type="text/css" href="../styles/book.css"/>\n' +
    "</head>\n" +
    `<body>\n${body}\n</body>\n` +
    "</html>\n"
  );
}

function paragraphsHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => `<p>${escapeXhtml(line)}</p>`)
    .join("\n");
}

/** Full-page EPUB 3 cover XHTML referencing `../images/<imageFileName>`. */
export function renderCoverXhtml(
  title: string,
  language: string,
  imageFileName: string,
): string {
  const body =
    '<section class="cover" epub:type="cover">' +
    `<img src="../images/${escapeXhtml(imageFileName)}" alt="${escapeXhtml(title)}"/>` +
    "</section>";
  return wrapXhtml(title, language, body);
}

/** Dedicated EPUB 3 title page with title, optional subtitle and optional author. */
export function renderTitlePageXhtml(
  front: BookFrontMatter,
  fallbackTitle: string,
  language: string,
): string {
  const title = (front.title ?? "").trim() || fallbackTitle;
  const subtitle = (front.subtitle ?? "").trim();
  const author = (front.author ?? "").trim();
  const lines = [
    `<h1 class="book-title">${escapeXhtml(title)}</h1>`,
    ...(subtitle !== ""
      ? [`<p class="book-subtitle">${escapeXhtml(subtitle)}</p>`]
      : []),
    ...(author !== ""
      ? [`<p class="book-author">${escapeXhtml(author)}</p>`]
      : []),
  ];
  return wrapXhtml(
    title,
    language,
    `<section class="title-page" epub:type="titlepage">\n${lines.join("\n")}\n</section>`,
  );
}

/** Copyright and ISBN notice page. */
export function renderCopyrightXhtml(
  front: BookFrontMatter,
  language: string,
): string {
  const copyright = (front.copyright ?? "").trim();
  const isbn = (front.isbn ?? "").trim();
  const parts: string[] = [];
  if (copyright !== "") parts.push(paragraphsHtml(copyright));
  if (isbn !== "") {
    const label = /^isbn/i.test(isbn) ? isbn : `ISBN ${isbn}`;
    parts.push(`<p class="book-isbn">${escapeXhtml(label)}</p>`);
  }
  return wrapXhtml(
    "Copyright",
    language,
    `<section class="copyright" epub:type="copyright-page">\n${parts.join("\n")}\n</section>`,
  );
}

/** Centred italic dedication page. */
export function renderDedicationXhtml(
  dedication: string,
  language: string,
): string {
  return wrapXhtml(
    "Dedication",
    language,
    `<section class="dedication" epub:type="dedication">\n${paragraphsHtml(dedication)}\n</section>`,
  );
}

/** Back-matter page (Acknowledgements or About the author). */
export function renderBackMatterXhtml(
  heading: string,
  epubType: string,
  text: string,
  language: string,
): string {
  const body =
    `<section class="back-matter" epub:type="${escapeXhtml(epubType)}">\n` +
    `<h1 class="chapter">${escapeXhtml(heading)}</h1>\n` +
    `${paragraphsHtml(text)}\n` +
    "</section>";
  return wrapXhtml(heading, language, body);
}

/** Builds optional EPUB 3 front-matter and back-matter XHTML pages from book matter fields. */
export function buildEpubMatterPages(
  title: string,
  language: string,
  front: BookFrontMatter | undefined,
  back: BookBackMatter | undefined,
): { frontPages: EpubMatterPage[]; backPages: EpubMatterPage[] } {
  const frontPages: EpubMatterPage[] = [];
  if (front !== undefined) {
    const hasTitle =
      (front.title ?? "").trim() !== "" ||
      (front.subtitle ?? "").trim() !== "" ||
      (front.author ?? "").trim() !== "";
    if (hasTitle) {
      frontPages.push({
        id: "front-title",
        fileName: "title-page.xhtml",
        title: "Title Page",
        epubType: "titlepage",
        xhtml: renderTitlePageXhtml(front, title, language),
      });
    }
    if (
      (front.copyright ?? "").trim() !== "" ||
      (front.isbn ?? "").trim() !== ""
    ) {
      frontPages.push({
        id: "front-copyright",
        fileName: "copyright.xhtml",
        title: "Copyright",
        epubType: "copyright-page",
        xhtml: renderCopyrightXhtml(front, language),
      });
    }
    if ((front.dedication ?? "").trim() !== "") {
      frontPages.push({
        id: "front-dedication",
        fileName: "dedication.xhtml",
        title: "Dedication",
        epubType: "dedication",
        xhtml: renderDedicationXhtml(front.dedication!, language),
      });
    }
  }
  const backPages: EpubMatterPage[] = [];
  if (back !== undefined) {
    if ((back.acknowledgments ?? "").trim() !== "") {
      backPages.push({
        id: "back-acknowledgements",
        fileName: "acknowledgements.xhtml",
        title: "Acknowledgements",
        epubType: "acknowledgments",
        xhtml: renderBackMatterXhtml(
          "Acknowledgements",
          "acknowledgments",
          back.acknowledgments!,
          language,
        ),
      });
    }
    if ((back.aboutAuthor ?? "").trim() !== "") {
      backPages.push({
        id: "back-about-author",
        fileName: "about-author.xhtml",
        title: "About the author",
        epubType: "afterword",
        xhtml: renderBackMatterXhtml(
          "About the author",
          "afterword",
          back.aboutAuthor!,
          language,
        ),
      });
    }
  }
  return { frontPages, backPages };
}

/** EPUB 3 navigation document (`nav.xhtml`) with nested chapter/subheading TOC and `landmarks` nav. */
export function renderNavXhtml(options: {
  readonly title: string;
  readonly language: string;
  readonly chapters: readonly EpubNavChapter[];
  readonly frontPages: readonly EpubMatterPage[];
  readonly backPages: readonly EpubMatterPage[];
  readonly coverFileName: string | null;
  readonly includeSubheadings: boolean;
}): string {
  const {
    title,
    language,
    chapters,
    frontPages,
    backPages,
    coverFileName,
    includeSubheadings,
  } = options;

  const tocItems: string[] = [];
  for (const ch of chapters) {
    const href = `xhtml/${escapeXhtml(ch.fileName)}`;
    if (includeSubheadings && ch.subheadings.length > 0) {
      const nested = ch.subheadings
        .map(
          (sub) =>
            `          <li><a href="${href}#${escapeXhtml(sub.id)}">${escapeXhtml(sub.title)}</a></li>`,
        )
        .join("\n");
      tocItems.push(
        `      <li>\n        <a href="${href}">${escapeXhtml(ch.title)}</a>\n        <ol>\n${nested}\n        </ol>\n      </li>`,
      );
    } else {
      tocItems.push(
        `      <li><a href="${href}">${escapeXhtml(ch.title)}</a></li>`,
      );
    }
  }
  for (const page of backPages) {
    tocItems.push(
      `      <li><a href="xhtml/${escapeXhtml(page.fileName)}">${escapeXhtml(page.title)}</a></li>`,
    );
  }

  const landmarks: string[] = [];
  if (coverFileName !== null) {
    landmarks.push(
      `      <li><a epub:type="cover" href="xhtml/${escapeXhtml(coverFileName)}">Cover</a></li>`,
    );
  }
  for (const page of frontPages) {
    landmarks.push(
      `      <li><a epub:type="${escapeXhtml(page.epubType)}" href="xhtml/${escapeXhtml(page.fileName)}">${escapeXhtml(page.title)}</a></li>`,
    );
  }
  landmarks.push(
    '      <li><a epub:type="toc" href="nav.xhtml#toc">Table of Contents</a></li>',
  );
  const firstChapter = chapters[0];
  if (firstChapter !== undefined) {
    landmarks.push(
      `      <li><a epub:type="bodymatter" href="xhtml/${escapeXhtml(firstChapter.fileName)}">Start of Reading</a></li>`,
    );
  }

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
    `${tocItems.join("\n")}\n` +
    "    </ol>\n" +
    "  </nav>\n" +
    '  <nav epub:type="landmarks" id="landmarks" hidden="">\n' +
    "    <h2>Landmarks</h2>\n" +
    "    <ol>\n" +
    `${landmarks.join("\n")}\n` +
    "    </ol>\n" +
    "  </nav>\n" +
    "</body>\n" +
    "</html>\n"
  );
}
