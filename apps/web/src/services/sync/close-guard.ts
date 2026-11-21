// Leaving a document this device cannot save asks first: the person may export a copy, stay, or leave without it.
import { CLOSE_WORDS, createValue, formatTime } from "@manent/ui";
import type { ConsequenceDialogProps, Subscribable } from "@manent/ui";
import type { DocumentServices, DocumentSource } from "../ports.ts";

export interface CloseGuard {
  /** The open document whose facts say this device cannot save it, and since when (milliseconds since the epoch). */
  failing(): { docId: string; since: number } | null;
  /** Shows the question; `export` has run `doc.export`, and the document stays open. */
  ask(): Promise<"stay" | "leave" | "export">;
}

type Answer = "cancel" | "action" | "alternative";

const noop = (): void => {};

interface Watched {
  since: number | null;
  stop(): void;
}

/** The guard over the documents opened through it, which it passes on to `documents`, until each is closed. */
export function createCloseGuard(options: {
  documents: DocumentSource;
  dialog: (words: ConsequenceDialogProps) => Promise<Answer>;
  run: (commandId: string) => void;
  now: () => number;
}): CloseGuard & DocumentSource {
  const { documents } = options;
  const watched = new Map<string, Watched>();
  const watch = (services: DocumentServices): Watched => {
    const entry: Watched = { since: null, stop: noop };
    const follow = (): void => {
      const failing = services.status.get().device === "failing";
      if (!failing) entry.since = null;
      else entry.since ??= options.now();
    };
    follow();
    entry.stop = services.status.subscribe(follow);
    return entry;
  };
  const failing = (): { docId: string; since: number } | null => {
    for (const [docId, { since }] of watched)
      if (since !== null) return { docId, since };
    return null;
  };
  return {
    open(docId) {
      const services = documents.open(docId);
      if (!watched.has(docId)) watched.set(docId, watch(services));
      return services;
    },
    close(docId) {
      watched.get(docId)?.stop();
      watched.delete(docId);
      documents.close(docId);
    },
    failing,
    async ask() {
      const shown = failing();
      if (shown === null) return "leave";
      const answer = await options.dialog({
        open: true,
        title: CLOSE_WORDS.title,
        body: CLOSE_WORDS.body(formatTime(shown.since)),
        action: CLOSE_WORDS.exportCopy,
        destructive: false,
        alternative: {
          label: CLOSE_WORDS.closeWithout,
          destructive: true,
          onAction: noop,
        },
        busyLabel: null,
        refusal: null,
        onAction: noop,
        onCancel: noop,
      });
      if (answer === "cancel") return "stay";
      if (answer === "alternative") return "leave";
      options.run("doc.export");
      return "export";
    },
  };
}

/**
 * The question the guard asks, drawn by whoever reads `question`: each of its buttons answers `dialog`'s promise and
 * takes the question away.
 */
export function createCloseQuestion(): {
  question: Subscribable<ConsequenceDialogProps | null>;
  dialog: (words: ConsequenceDialogProps) => Promise<Answer>;
} {
  const question = createValue<ConsequenceDialogProps | null>(null);
  return {
    question,
    dialog: (words) =>
      new Promise((resolve) => {
        const answer = (choice: Answer) => (): void => {
          question.set(null);
          resolve(choice);
        };
        question.set({
          ...words,
          onAction: answer("action"),
          onCancel: answer("cancel"),
          alternative: words.alternative && {
            ...words.alternative,
            onAction: answer("alternative"),
          },
        });
      }),
  };
}
