// Reads Book front/back matter, cover asset id and TOC/recto settings for a live document at export time.
import { bookMatter, titlePage } from "@manent/crdt";
import type { BookBackMatter, BookFrontMatter } from "@manent/formats";
import { bookMatterFromFields } from "@manent/formats";
import { archiveSource } from "../archive/archive-source.ts";
import { liveEditor } from "../editor-host/live-editor.ts";

export interface BookExportMeta {
  readonly frontMatter: BookFrontMatter;
  readonly backMatter: BookBackMatter;
  readonly coverAssetId: string | null;
  readonly includeToc: boolean;
  readonly tocSubheadings: boolean;
  readonly rectoChapters: boolean;
}

/** Collects front/back matter, cover id and book layout toggles for `docId` (empty defaults when unavailable). */
export function readBookExportMeta(
  docId: string,
  fallbackTitle: string,
): BookExportMeta {
  const editor = liveEditor(docId);
  const combined: Record<string, string | undefined> = {};
  if (editor !== null) {
    const tp = titlePage(editor.doc).fields();
    const bm = bookMatter(editor.doc).fields();
    combined.title = tp.title;
    combined.author = tp.authors;
    combined.subtitle = bm.subtitle;
    combined.isbn = bm.isbn;
    combined.copyright = bm.copyright;
    combined.dedication = bm.dedication;
    combined.acknowledgments = bm.acknowledgments;
    combined.aboutAuthor = bm.aboutAuthor;
    combined.coverAssetId = bm.coverAssetId;
  }
  const { front, back, coverAssetId } = bookMatterFromFields(
    combined,
    fallbackTitle,
  );
  const services = archiveSource.get();
  const store = services?.openScriptStore(docId);
  return {
    frontMatter: front,
    backMatter: back,
    coverAssetId,
    includeToc: store?.get("script.includeToc") === true,
    tocSubheadings: store?.get("script.tocSubheadings") !== false,
    rectoChapters: store?.get("script.rectoChapters") === true,
  };
}
