// The fields of a script's title page and the front pages after it, as the script's titlePage map holds them.

/** In the order they are laid out. */
export const TITLE_PAGE_FIELDS = Object.freeze([
  "title",
  "credit",
  "authors",
  "source",
  "contact",
  "draft",
  "cast",
  "setting",
  "summary",
] as const);

export type TitlePageField = (typeof TITLE_PAGE_FIELDS)[number];

/** Each field's text, which may hold line breaks; "" when it holds none. */
export type TitlePageFields = Readonly<Record<TitlePageField, string>>;
