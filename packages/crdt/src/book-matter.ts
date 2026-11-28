// Additive Book front/back matter and cover fields stored on the script's titlePage Y.Map.
import { BOOK_MATTER_FIELDS, isAssetId } from "@manent/schema";
import type { BookMatterField, BookMatterFields } from "@manent/schema";
import type { YMapEvent } from "yjs";
import { ORIGIN_LOAD, ORIGIN_REMOTE, yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { TITLE_PAGE_MAP } from "./script-maps.ts";

/** Book publishing front/back matter and cover image reference; invalid values read as "". */
export interface BookMatterView {
  get(field: BookMatterField): string;
  fields(): BookMatterFields;
  /** Writes one field in a single transaction of `origin`; "" removes it. Rejects invalid non-empty `coverAssetId`. */
  set(field: BookMatterField, value: string, origin: unknown): void;
  subscribe(
    listener: (fields: readonly BookMatterField[], remote: boolean) => void,
  ): () => void;
}

export function bookMatter(doc: CrdtDoc): BookMatterView {
  const ydoc = yDocOf(doc);
  const map = ydoc.getMap<unknown>(TITLE_PAGE_MAP);
  const get = (field: BookMatterField): string => {
    const value = map.get(field);
    if (typeof value !== "string") return "";
    if (field === "coverAssetId") return isAssetId(value) ? value : "";
    return value;
  };
  return {
    get,
    fields: () =>
      Object.freeze({
        subtitle: get("subtitle"),
        isbn: get("isbn"),
        copyright: get("copyright"),
        dedication: get("dedication"),
        acknowledgments: get("acknowledgments"),
        aboutAuthor: get("aboutAuthor"),
        coverAssetId: get("coverAssetId"),
      }),
    set(field, value, origin) {
      if (field === "coverAssetId" && value !== "" && !isAssetId(value)) {
        throw new TypeError("coverAssetId must be a 64-character hex digest");
      }
      ydoc.transact(() => {
        if (value === "") map.delete(field);
        else map.set(field, value);
      }, origin);
    },
    subscribe(listener) {
      const observer = (event: YMapEvent<unknown>): void => {
        const { origin } = event.transaction;
        const changed = BOOK_MATTER_FIELDS.filter((field) =>
          event.keysChanged.has(field),
        );
        if (changed.length === 0) return;
        listener(changed, origin === ORIGIN_REMOTE || origin === ORIGIN_LOAD);
      };
      map.observe(observer);
      return () => map.unobserve(observer);
    },
  };
}
