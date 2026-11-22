// The names of the script's maps beside its text: two written once, on the device, when an imported script is made,
// and its title page.

/** The root map of the script's notes: one `ScriptNote` per note id, read and written through `jsonMap`. */
export const NOTES_MAP = "notes";
/** The root map of what an import brought in: one import record under `IMPORT_RECORD_KEY`. */
export const IMPORT_MAP = "imported";
export const IMPORT_RECORD_KEY = "record";
/** The root map of the title page and the front pages after it: one string per `TitlePageField`, read through `titlePage`. */
export const TITLE_PAGE_MAP = "titlePage";
