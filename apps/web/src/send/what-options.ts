// The choices of a Send form's What row: what of the document it sends; a feature adds its option with one line.
import type { Pagination } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { EDITOR_WORDS } from "@manent/ui";
import { liveEditor } from "../editor-host/live-editor.ts";
import type { SendFormId } from "../screens/send/form-ids.ts";
import { engineOf } from "./print-pages.ts";

/** The JSON of the script's writers' material roots, by entry id, which a What option's transform reads. */
export interface MaterialSnapshot {
  readonly alternates: Readonly<Record<string, unknown>>;
  readonly cuts: Readonly<Record<string, unknown>>;
}

/** A script with no writers' material. */
export const EMPTY_MATERIAL: MaterialSnapshot = Object.freeze({
  alternates: Object.freeze({}),
  cuts: Object.freeze({}),
});

export interface SendWhatOption {
  readonly id: string;
  readonly label: string;
  readonly appliesTo: readonly SendFormId[];
  /** The document whose pages are sent, made from the open editor's; null sends the open editor's own pages. */
  readonly transform:
    ((doc: DocJSON, material: MaterialSnapshot) => DocJSON) | null;
  /** The ids of the file types Export's As row offers it with; absent offers it with every type. */
  readonly fileTypes?: readonly string[];
  /** Offered only while page numbers are locked; absent is false. */
  readonly lockedOnly?: boolean;
}

/** The first that a form offers is chosen when the form opens. */
export const SEND_WHAT_OPTIONS: readonly SendWhatOption[] = [
  {
    id: "whole_script",
    label: EDITOR_WORDS.send.wholeScript,
    appliesTo: ["export", "print"],
    transform: null,
  },
];

/** The options `form` offers with the file type `fileTypeId` (null: none chosen), in list order. */
export function whatOffered(
  form: SendFormId,
  fileTypeId: string | null,
  locked: boolean,
): SendWhatOption[] {
  return SEND_WHAT_OPTIONS.filter(
    (option) =>
      option.appliesTo.includes(form) &&
      (option.fileTypes === undefined ||
        (fileTypeId !== null && option.fileTypes.includes(fileTypeId))) &&
      (option.lockedOnly !== true || locked),
  );
}

/**
 * The pages `option` sends of `docId`: the open editor's `pages`, or the document its transform makes from the open
 * editor's, paginated apart in the same engine, page profile and locks.
 */
export function pagesFor(
  option: SendWhatOption,
  docId: string,
  pages: Pagination,
  material: () => MaterialSnapshot,
): Pagination {
  const editor = liveEditor(docId);
  if (option.transform === null || editor === null) return pages;
  const doc: DocJSON = editor.view.state.doc.toJSON();
  const engine = engineOf(pages);
  return engine.paginate(
    engine.toLayoutBlocks(blocksOf(option.transform(doc, material()))),
    pages.profile,
    pages.locks,
  );
}
