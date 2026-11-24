// Sent drafts: freezing sent versions, opening rounds, serving draft links and rendering watermarked PDFs.
import latin400Italic from "@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff";
import latin400Normal from "@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff";
import latin700Italic from "@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff";
import latin700Normal from "@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff";
import latinExt400Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-italic.woff";
import latinExt400Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-normal.woff";
import latinExt700Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-italic.woff";
import latinExt700Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-normal.woff";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createDemoDirectory } from "@manent/demo";
import type { FontFaceKey } from "@manent/pagination";
import { createDraftsService, readScriptFonts } from "@manent/server-core";
import type { ServerService } from "./services.ts";

const FACES: Readonly<Record<FontFaceKey, string>> = Object.freeze({
  "latin-400-normal": latin400Normal,
  "latin-400-italic": latin400Italic,
  "latin-700-normal": latin700Normal,
  "latin-700-italic": latin700Italic,
  "latin-ext-400-normal": latinExt400Normal,
  "latin-ext-400-italic": latinExt400Italic,
  "latin-ext-700-normal": latinExt700Normal,
  "latin-ext-700-italic": latinExt700Italic,
});

const linkToken = (): string => randomBytes(32).toString("base64url");

const loadDraftFonts = () =>
  readScriptFonts((key) => resolve(import.meta.dir, FACES[key]));

export const draftsService: ServerService = {
  create({ storage, sync, clock, ids, names, draftEvents }) {
    const drafts = createDraftsService({
      storage,
      sync,
      clock,
      ids,
      tokens: linkToken,
      names,
      fonts: loadDraftFonts,
      users: createDemoDirectory(),
      draftEvents,
      log: console.error,
    });
    return { hooks: [], config: { drafts } };
  },
};
