// The lossless shape of a stored document: nothing optional, nothing removed.

export interface RawMark {
  type: string;
  attrs: Record<string, unknown>;
}

export interface RawText {
  type: "text";
  text: string;
  marks: RawMark[];
}

export interface RawElement {
  type: string;
  attrs: Record<string, unknown>;
  content: (RawElement | RawText)[];
}

export interface RawDoc extends RawElement {
  type: "doc";
}
