// Book-only Footnotes section in Details → Book: numbered list (capped at 8 + Show all), active-caret highlight,
// click-to-jump, inline Edit/Save/Cancel and undoable Remove — without adding a 4th side-panel tab.
import { extractFootnotes } from "@manent/formats";
import type { BlockJSON, DocJSON } from "@manent/schema";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DOCUMENT_WORDS,
  Textarea,
  cn,
  formatCount,
} from "@manent/ui";
import { ChevronRightIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { useCanEdit } from "./ruler-bar.tsx";

const INITIAL_LIMIT = 8;

interface FootnoteRow {
  readonly id: string;
  readonly ordinal: number;
  readonly text: string;
  readonly blockId: string | null;
}

function readFootnotes(docId: string): FootnoteRow[] {
  const editor = liveEditor(docId);
  const pmDoc = editor?.view?.state?.doc;
  if (pmDoc === undefined || pmDoc === null) return [];
  const json: DocJSON = pmDoc.toJSON();
  const blocks: BlockJSON[] = (json.content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  const extracted = extractFootnotes(blocks);
  return extracted.notes.map((note) => {
    const rawId = blocks[note.blockIndex]?.attrs?.id;
    return {
      id: note.id,
      ordinal: note.ordinal,
      text: note.text,
      blockId: typeof rawId === "string" ? rawId : null,
    };
  });
}

function mutateFootnoteById(
  docId: string,
  footnoteId: string,
  nextText: string | null,
): boolean {
  const editor = liveEditor(docId);
  if (editor === null) return false;
  const { state, dispatch } = editor.view;
  const markType = state.schema.marks.footnote;
  if (markType === undefined) return false;
  const tr = state.tr;
  let changed = false;
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const match = node.marks.find(
      (m) => m.type === markType && m.attrs.id === footnoteId,
    );
    if (match === undefined) return;
    const from = pos;
    const to = pos + node.nodeSize;
    tr.removeMark(from, to, match);
    if (nextText !== null) {
      tr.addMark(from, to, markType.create({ id: footnoteId, text: nextText }));
    }
    changed = true;
  });
  if (!changed) return false;
  dispatch(tr);
  return true;
}

/** Drawn strictly inside Details → Book for manuscript documents; returns null for all other formats. */
export function FootnotesSection(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { dom } = useEnvironment();
  const scriptStore = useMemo(
    () => services.openScriptStore(docId),
    [services, docId],
  );
  const subscribeFormat = useCallback(
    (notify: () => void) => scriptStore.subscribe("script.format", notify),
    [scriptStore],
  );
  const isBook =
    useSyncExternalStore(subscribeFormat, () =>
      scriptStore.get("script.format"),
    ) === "manuscript";

  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );
  const activeFootnoteId = useEditorFact("markFootnoteId");
  const editable = useCanEdit(docId);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const notes = useMemo(() => {
    void revision;
    void activeFootnoteId;
    return isBook ? readFootnotes(docId) : [];
  }, [docId, editor, isBook, revision, activeFootnoteId]);

  if (!isBook) return null;

  const visible = showAll ? notes : notes.slice(0, INITIAL_LIMIT);
  const hiddenCount = notes.length - visible.length;

  return (
    <Collapsible
      data-tour="details:footnotes"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRevision((n) => n + 1);
      }}
      className="flex flex-col gap-2"
    >
      <CollapsibleTrigger className="group/disclosure -ms-2 flex min-h-row min-w-0 flex-1 items-center gap-1 rounded-control px-1 text-start text-ui font-semibold transition-colors hover:bg-subtle active:bg-control">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-muted duration-(--dur-fast) ease-out group-hover/disclosure:text-fg group-data-panel-open/disclosure:rotate-90 motion-safe:transition-transform"
        />
        <span className="truncate">{DOCUMENT_WORDS.footnotesHeading}</span>
        {notes.length > 0 ? (
          <span
            aria-hidden="true"
            className="mn-tag ms-auto shrink-0 font-medium text-fg-muted tabular-nums"
          >
            {formatCount(notes.length)}
          </span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in duration-(--dur-fast) ease-out fade-in-0">
        {notes.length === 0 ? (
          <p className="text-meta text-fg-muted">
            {DOCUMENT_WORDS.footnotesEmpty}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <ol className="flex flex-col gap-1">
              {visible.map((note) => {
                const isActive = activeFootnoteId === note.id;
                const isEditing = editingId === note.id;
                return (
                  <li
                    key={note.id}
                    className={cn(
                      "rounded-control border border-transparent p-1.5 transition-colors",
                      isActive ? "border-accent bg-subtle" : "hover:bg-subtle",
                    )}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-1.5">
                        <Textarea
                          rows={2}
                          value={draft}
                          aria-label={DOCUMENT_WORDS.bookToolbar.footnoteText}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              setEditingId(null);
                            } else if (
                              e.key === "Enter" &&
                              (e.metaKey || e.ctrlKey)
                            ) {
                              e.preventDefault();
                              mutateFootnoteById(docId, note.id, draft.trim());
                              setEditingId(null);
                              setRevision((n) => n + 1);
                            }
                          }}
                          className="min-h-12 resize-none text-ui"
                        />
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-control-sm text-meta"
                            onClick={() => setEditingId(null)}
                          >
                            {DOCUMENT_WORDS.footnoteCancel}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-control-sm text-meta"
                            onClick={() => {
                              mutateFootnoteById(docId, note.id, draft.trim());
                              setEditingId(null);
                              setRevision((n) => n + 1);
                            }}
                          >
                            {DOCUMENT_WORDS.footnoteSave}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5">
                        <button
                          type="button"
                          aria-label={DOCUMENT_WORDS.footnoteJump(note.ordinal)}
                          className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 text-start text-ui"
                          onClick={() => {
                            if (note.blockId !== null) {
                              services.editor.run({
                                kind: "go_to",
                                blockId: note.blockId,
                                offset: 0,
                              });
                              dom.focusPage();
                            }
                          }}
                        >
                          <span className="shrink-0 font-semibold text-fg-muted tabular-nums">
                            {note.ordinal}.
                          </span>
                          <span className="line-clamp-2 min-w-0 flex-1 text-fg">
                            {note.text === "" ? "…" : note.text}
                          </span>
                        </button>
                        {editable ? (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={DOCUMENT_WORDS.footnoteEdit}
                              title={DOCUMENT_WORDS.footnoteEdit}
                              onClick={() => {
                                setEditingId(note.id);
                                setDraft(note.text);
                              }}
                            >
                              <PencilIcon
                                aria-hidden="true"
                                className="size-3.5"
                              />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={DOCUMENT_WORDS.footnoteRemove}
                              title={DOCUMENT_WORDS.footnoteRemove}
                              className="text-fg-muted hover:text-danger"
                              onClick={() => {
                                mutateFootnoteById(docId, note.id, null);
                                setRevision((n) => n + 1);
                              }}
                            >
                              <Trash2Icon
                                aria-hidden="true"
                                className="size-3.5"
                              />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {hiddenCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-control-sm self-start text-meta text-fg-muted hover:text-fg"
                onClick={() => setShowAll(true)}
              >
                {DOCUMENT_WORDS.footnotesShowAll(notes.length)}
              </Button>
            ) : null}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
