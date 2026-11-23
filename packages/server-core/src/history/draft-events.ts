// What another feature hears of a draft: named, sent or issued, each once its commit is done.

/** Each member is called after the commit it names, returns at once and never throws. */
export interface DraftEvents {
  named(docId: string, versionId: string, userId: string): void;
  sent(docId: string, versionId: string, userId: string): void;
  issued(docId: string, setId: string, userId: string): void;
}
