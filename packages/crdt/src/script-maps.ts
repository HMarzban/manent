// The names of the script's maps beside its text: two written once, on the device, when an imported script is made,
// its title page, and its writers' material and scene progress.

/**
 * The root map of the script's notes: one `ScriptNote` per note id, read and written through `jsonMap`. Writers
 * write it as ordinary edits, as they write `alternates` and `cuts`.
 */
export const NOTES_MAP = "notes";
/** The root map of what an import brought in: one import record under `IMPORT_RECORD_KEY`. */
export const IMPORT_MAP = "imported";
export const IMPORT_RECORD_KEY = "record";
/** The root map of the title page and the front pages after it: one string per `TitlePageField`, read through `titlePage`. */
export const TITLE_PAGE_MAP = "titlePage";
/** The root map of the script's alternates: one JSON value per alternate id. */
export const ALTERNATES_MAP = "alternates";
/** The root map of the script's cuts: one JSON value per cut id. */
export const CUTS_MAP = "cuts";
/** The root map of each scene's progress: one JSON value per scene heading's block id. */
export const SCENE_PROGRESS_MAP = "sceneProgress";
