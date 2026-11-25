// Multi-annotation switcher strip shown inside CommentPopover when a block carries multiple comments and/or notes.
import { COMMENTS_WORDS } from "@manent/ui";
import { MessageSquareIcon, StickyNoteIcon } from "lucide-react";
import type { ReactNode } from "react";
import { fullNameFor, threadItemsOf } from "./comments-format.ts";
import type { ScriptCommentsState } from "./comments-types.ts";

export interface BlockAnnotationItem {
  readonly id: string;
  readonly kind: "comment" | "note";
  readonly label: string;
  readonly title: string;
}

const previewSnippet = (text: string | undefined): string => {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 59)}…` : clean;
};

/** Projects a block's active annotation ids into labelled comment and writer-only note pills. */
export function blockItemsOf(
  ids: readonly string[],
  state: ScriptCommentsState,
): BlockAnnotationItem[] {
  const entries = ids.flatMap((id): Omit<BlockAnnotationItem, "label">[] => {
    const thread = state.threads[id];
    if (thread !== undefined) {
      const author = fullNameFor(thread.authorUserId, state.people);
      const quote = previewSnippet(thread.anchor?.quote);
      const body = previewSnippet(threadItemsOf(id, state.items)[0]?.body);
      const detail = quote !== "" ? quote : body;
      return [
        {
          id,
          kind: "comment" as const,
          title: detail !== "" ? `${author} · ${detail}` : author,
        },
      ];
    }
    const stored = state.canEdit
      ? state.notes.find((n) => n.id === id)
      : undefined;
    if (stored !== undefined) {
      const author = stored.note.writerName ?? COMMENTS_WORDS.noteLabel;
      const quote = previewSnippet(stored.note.anchor?.quote);
      const body = previewSnippet(stored.note.text);
      const detail = quote !== "" ? quote : body;
      return [
        {
          id,
          kind: "note" as const,
          title: detail !== "" ? `${author} · ${detail}` : author,
        },
      ];
    }
    return [];
  });
  const totalComments = entries.filter((e) => e.kind === "comment").length;
  const totalNotes = entries.length - totalComments;
  let commentIndex = 0;
  let noteIndex = 0;
  return entries.map((entry) => {
    const indexInKind = entry.kind === "note" ? noteIndex++ : commentIndex++;
    const countOfKind = entry.kind === "note" ? totalNotes : totalComments;
    return {
      ...entry,
      label: COMMENTS_WORDS.blockItemLabel(
        entry.kind,
        indexInKind,
        countOfKind,
      ),
    };
  });
}

/** One-click selector strip letting the reader see and jump between every Comment and Note on the same line. */
export function AnnotationStrip(props: {
  items: readonly BlockAnnotationItem[];
  activeId: string;
  onSelect(id: string): void;
}): ReactNode {
  const { items, activeId, onSelect } = props;
  return (
    <div
      role="group"
      aria-label={COMMENTS_WORDS.blockAnnotations}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-3 py-2"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="mn-annotation-pill"
          data-kind={item.kind}
          aria-current={item.id === activeId ? "true" : undefined}
          title={item.title}
          onClick={() => onSelect(item.id)}
        >
          {item.kind === "note" ? (
            <StickyNoteIcon aria-hidden="true" className="size-3 shrink-0" />
          ) : (
            <MessageSquareIcon
              aria-hidden="true"
              className="size-3 shrink-0 text-attention"
            />
          )}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
