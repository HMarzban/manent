// Compose forms and writer-note view rendered inside the comment popover.
import { Avatar, COMMENTS_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import type { PersonServices } from "../services/ports.ts";
import { commentsActions } from "../state/comments.store.ts";
import { anchorPlaceLabel, dayTimeLabel } from "./comments-format.ts";
import type {
  PopoverMode,
  ScriptCommentsState,
  StoredNote,
} from "./comments-types.ts";
import { MentionField } from "./mention-field.tsx";

export function CommentCompose(props: {
  docId: string;
  mode: Extract<PopoverMode, { kind: "comment" }>;
  state: ScriptCommentsState;
  services: PersonServices;
  now(): number;
  onSwitchMode(mode: PopoverMode): void;
}): ReactNode {
  const { docId, mode, state, services, now, onSwitchMode } = props;
  const contextQuote =
    mode.anchor !== null && mode.anchor.quote !== ""
      ? mode.anchor.quote
      : mode.heading !== undefined && mode.heading.trim() !== ""
        ? mode.heading
        : null;
  return (
    <div className="flex flex-col gap-3 p-3">
      {mode.anchor === null ? (
        <p className="text-meta text-fg-muted">{COMMENTS_WORDS.wholeScript}</p>
      ) : contextQuote !== null ? (
        <blockquote className="mn-comment-quote line-clamp-2 pl-2 text-meta text-fg-muted">
          {contextQuote}
        </blockquote>
      ) : null}
      <MentionField
        placeholder={COMMENTS_WORDS.composerPlaceholder}
        submitLabel={COMMENTS_WORDS.commentLabel}
        autoFocus
        mentions
        people={state.people}
        peopleState={state.peopleState}
        onLoadPeople={() =>
          void commentsActions.loadPeople(docId, services.userId)
        }
        onSubmit={({ body: text, mentionedUserIds }) => {
          const threadId = commentsActions.startComment(
            docId,
            services,
            {
              anchor: mode.anchor,
              roundId: null,
              body: text,
              mentionedUserIds,
            },
            now,
          );
          if (threadId === null) return false;
          onSwitchMode({ kind: "thread", id: threadId, place: mode.place });
          return true;
        }}
      />
    </div>
  );
}

export function NoteCompose(props: {
  docId: string;
  mode: Extract<PopoverMode, { kind: "note" }>;
  state: ScriptCommentsState;
  writerName: string;
  now(): number;
  onClose(): void;
}): ReactNode {
  const { docId, mode, state, writerName, now, onClose } = props;
  return (
    <div className="flex flex-col gap-3 p-3">
      {mode.anchor.quote !== "" ? (
        <blockquote className="mn-note-quote line-clamp-2 pl-2 text-meta text-fg-muted">
          {mode.anchor.quote}
        </blockquote>
      ) : null}
      <MentionField
        placeholder={COMMENTS_WORDS.notePlaceholder}
        submitLabel={COMMENTS_WORDS.noteLabel}
        autoFocus
        mentions={false}
        people={state.people}
        peopleState={state.peopleState}
        onSubmit={({ body: text }) => {
          const noteId = commentsActions.addNote(
            docId,
            writerName,
            { anchor: mode.anchor, text },
            now,
          );
          if (noteId === null) return false;
          onClose();
          return true;
        }}
      />
    </div>
  );
}

export function NoteBody(props: {
  note: StoredNote;
  state: ScriptCommentsState;
  now(): number;
}): ReactNode {
  const { note, state, now } = props;
  const removed = note.note.anchor !== null && state.removedIds.has(note.id);
  const notePlace = anchorPlaceLabel(note.note.anchor, state.blockScenes);
  const noteTime =
    note.note.at !== null ? dayTimeLabel(note.note.at, now()) : null;
  const noteMeta =
    noteTime !== null
      ? COMMENTS_WORDS.metaLine(noteTime, notePlace)
      : notePlace;
  return (
    <div className="flex flex-col gap-3 p-3">
      {note.note.writerName !== null ? (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={note.note.writerName}
            initials={initialsOf(note.note.writerName)}
            colour={null}
            size="sm"
            decorative
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-ui font-semibold text-fg">
              {note.note.writerName}
            </span>
            {noteMeta !== null ? (
              <span className="truncate text-meta text-fg-muted tabular-nums">
                {noteMeta}
              </span>
            ) : null}
          </div>
        </div>
      ) : noteMeta !== null ? (
        <p className="text-meta text-fg-muted tabular-nums">{noteMeta}</p>
      ) : null}
      {removed ? (
        <p className="text-meta text-fg-muted">{COMMENTS_WORDS.textRemoved}</p>
      ) : null}
      {note.note.anchor !== null && note.note.anchor.quote !== "" ? (
        <blockquote className="mn-note-quote line-clamp-2 pl-2 text-meta text-fg-muted">
          {note.note.anchor.quote}
        </blockquote>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-ui text-fg">
        {note.note.text}
      </p>
    </div>
  );
}
