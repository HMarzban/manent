// The script's titlePage map: the fields of its title page and the front pages after it, last writer wins per field.
import { TITLE_PAGE_FIELDS } from "@manent/schema";
import type { TitlePageField, TitlePageFields } from "@manent/schema";
import type { YMapEvent } from "yjs";
import { ORIGIN_LOAD, ORIGIN_REMOTE, yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { TITLE_PAGE_MAP } from "./script-maps.ts";

/** The fields; a stored value that is not a string reads as "". */
export interface TitlePageView {
  get(field: TitlePageField): string;
  /** Every field, "" for each that holds nothing. */
  fields(): TitlePageFields;
  /** One transaction of `origin`; "" deletes the field. */
  set(field: TitlePageField, value: string, origin: unknown): void;
  /** Told the fields a transaction changed, in `TITLE_PAGE_FIELDS` order; `remote` for an update applied with ORIGIN_REMOTE or ORIGIN_LOAD. */
  subscribe(
    listener: (fields: readonly TitlePageField[], remote: boolean) => void,
  ): () => void;
}

export function titlePage(doc: CrdtDoc): TitlePageView {
  const ydoc = yDocOf(doc);
  const map = ydoc.getMap<unknown>(TITLE_PAGE_MAP);
  const get = (field: TitlePageField): string => {
    const value = map.get(field);
    return typeof value === "string" ? value : "";
  };
  return {
    get,
    fields: () =>
      Object.freeze({
        title: get("title"),
        credit: get("credit"),
        authors: get("authors"),
        source: get("source"),
        contact: get("contact"),
        draft: get("draft"),
        cast: get("cast"),
        setting: get("setting"),
        summary: get("summary"),
      }),
    set(field, value, origin) {
      ydoc.transact(() => {
        if (value === "") map.delete(field);
        else map.set(field, value);
      }, origin);
    },
    subscribe(listener) {
      const observer = (event: YMapEvent<unknown>): void => {
        const { origin } = event.transaction;
        const changed = TITLE_PAGE_FIELDS.filter((field) =>
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
