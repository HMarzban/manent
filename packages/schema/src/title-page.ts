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

/** Book publishing front/back matter and cover keys stored additively on the script's titlePage map. */
export const BOOK_MATTER_FIELDS = Object.freeze([
  "subtitle",
  "isbn",
  "copyright",
  "dedication",
  "acknowledgments",
  "aboutAuthor",
  "coverAssetId",
] as const);

export type BookMatterField = (typeof BOOK_MATTER_FIELDS)[number];

/** Each book matter field's text (or 64-hex SHA-256 asset ID for `coverAssetId`); "" when empty. */
export type BookMatterFields = Readonly<Record<BookMatterField, string>>;

export type TitlePageMapKey = TitlePageField | BookMatterField;
