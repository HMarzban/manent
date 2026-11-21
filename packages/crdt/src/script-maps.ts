// The names of the script's two maps that are written once, on the device, when an imported script is made.

/** The root map of the script's notes: one `ScriptNote` per note id, read and written through `jsonMap`. */
export const NOTES_MAP = "notes";
/** The root map of what an import brought in: one import record under `IMPORT_RECORD_KEY`. */
export const IMPORT_MAP = "imported";
export const IMPORT_RECORD_KEY = "record";
