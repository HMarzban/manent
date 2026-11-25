// The choices of a Send form's What row: what of the document it sends; a feature adds its option with one line.
import type { DocJSON } from "@manent/schema";
import { DRAFTS_WORDS, EDITOR_WORDS, MATERIAL_WORDS } from "@manent/ui";
import { withAlternates } from "../material/alternates/with-alternates.ts";
import type { SendFormId } from "../screens/send/form-ids.ts";
import { SIDES_WHAT_OPTION } from "./sides-file.tsx";

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
    appliesTo: ["export", "print", "send_draft"],
    transform: null,
  },
  {
    id: "with_alternates",
    label: MATERIAL_WORDS.printWithAlternates,
    appliesTo: ["print", "export"],
    transform: withAlternates,
  },
  {
    id: "pages",
    label: DRAFTS_WORDS.pagesOption,
    appliesTo: ["send_draft"],
    transform: null,
  },
  {
    id: "scenes",
    label: DRAFTS_WORDS.scenesOption,
    appliesTo: ["send_draft"],
    transform: null,
  },
  {
    id: "revised_pages",
    label: DRAFTS_WORDS.revisedPagesOnly,
    appliesTo: ["send_draft"],
    transform: null,
    lockedOnly: true,
  },
  SIDES_WHAT_OPTION,
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
