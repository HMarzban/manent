// Shared book front matter, back matter and cover shapes for PDF, Word (.docx) and EPUB 3 export.

export interface BookFrontMatter {
  readonly title?: string;
  readonly subtitle?: string;
  readonly author?: string;
  readonly copyright?: string;
  readonly isbn?: string;
  readonly dedication?: string;
}

export interface BookBackMatter {
  readonly acknowledgments?: string;
  readonly aboutAuthor?: string;
}

export interface BookCoverAsset {
  readonly mime: "image/png" | "image/jpeg" | "image/webp";
  readonly bytes: Uint8Array;
}

const clean = (value: string | undefined): string => (value ?? "").trim();

/** True when any front-matter text field is non-empty. */
export function hasFrontMatter(
  front: BookFrontMatter | null | undefined,
): boolean {
  if (front === null || front === undefined) return false;
  return (
    clean(front.title) !== "" ||
    clean(front.subtitle) !== "" ||
    clean(front.author) !== "" ||
    clean(front.copyright) !== "" ||
    clean(front.isbn) !== "" ||
    clean(front.dedication) !== ""
  );
}

/** True when either acknowledgements or about-the-author text is present. */
export function hasBackMatter(
  back: BookBackMatter | null | undefined,
): boolean {
  if (back === null || back === undefined) return false;
  return clean(back.acknowledgments) !== "" || clean(back.aboutAuthor) !== "";
}

/** Extracts front matter, back matter and optional cover asset id from combined title-page + book-matter fields. */
export function bookMatterFromFields(
  fields: Readonly<Record<string, string | undefined>>,
  fallbackTitle = "",
): {
  readonly front: BookFrontMatter;
  readonly back: BookBackMatter;
  readonly coverAssetId: string | null;
} {
  const title = clean(fields.title) || fallbackTitle.trim();
  const coverAssetId = clean(fields.coverAssetId);
  return {
    front: {
      title,
      subtitle: clean(fields.subtitle),
      author: clean(fields.author),
      copyright: clean(fields.copyright),
      isbn: clean(fields.isbn),
      dedication: clean(fields.dedication),
    },
    back: {
      acknowledgments: clean(fields.acknowledgments),
      aboutAuthor: clean(fields.aboutAuthor),
    },
    coverAssetId: coverAssetId === "" ? null : coverAssetId,
  };
}
