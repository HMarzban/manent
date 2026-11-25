// Embeds the existing Choose who you are screen unchanged inside the reader frame when sign-in is needed to read or comment.
import { Button, DIALOG_WORDS, READER_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import type { Api } from "../../api.ts";
import type { TabPerson } from "../../session.ts";
import { ChooseScreen } from "../choose.tsx";

export function ReaderChooser(props: {
  api: Api;
  person: TabPerson | null;
  setPerson(person: TabPerson): void;
  next: string;
  /** Draft title when opened by tapping a line anonymously; null when the link itself requires sign-in. */
  commentTitle: string | null;
  /** Present when the user may return to reading without signing in. */
  onCancel: (() => void) | null;
}): ReactNode {
  const { api, person, setPerson, next, commentTitle, onCancel } = props;
  return (
    <div
      className="z-10 flex h-screen min-h-0 flex-col overflow-y-auto bg-chrome text-fg"
      style={{ gridColumn: "1 / -1", gridRow: "1 / -1" }}
    >
      {commentTitle !== null || onCancel !== null ? (
        <div className="mx-auto flex w-full max-w-content-wide items-center justify-between gap-4 px-6 pt-6">
          {commentTitle === null ? (
            <div />
          ) : (
            <p className="text-ui text-fg">
              {READER_WORDS.chooseToComment(commentTitle)}
            </p>
          )}
          {onCancel === null ? null : (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {DIALOG_WORDS.cancel}
            </Button>
          )}
        </div>
      ) : null}
      <ChooseScreen
        api={api}
        person={person}
        setPerson={setPerson}
        next={next}
      />
    </div>
  );
}
