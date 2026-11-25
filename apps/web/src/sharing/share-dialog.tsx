// Share, drawn on a script's screen while the dialog store holds it: who has access, adding people and groups, the
// link, the summary line, and sending a draft instead.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  SELECTION_WORDS,
  SHARING_WORDS,
  Skeleton,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useId } from "react";
import type { ReactNode } from "react";
import { sendPath } from "../screens/send/form-ids.ts";
import { useEnvironment } from "../services/context.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { dialogActions, useOpenDialog } from "../state/dialog.store.ts";
import { AddRow } from "./add-row.tsx";
import { LinkGroup } from "./link-group.tsx";
import { PeopleList } from "./people-list.tsx";
import { useShare } from "./use-share.ts";
import type { ShareView } from "./use-share.ts";

const WORDS = SHARING_WORDS;
// the id `share.open` opens it with
const SHARE = "share";
const PLACEHOLDER_PEOPLE = 3;

function PeopleListSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="-mx-3 flex flex-col">
      {Array.from({ length: PLACEHOLDER_PEOPLE }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex min-h-row-2 items-center gap-2 px-3"
        >
          <Skeleton className="size-avatar-sm shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-control w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** "Send a draft to read…", with the line saying how sending differs from sharing; it needs a connection. */
function SendDraft(props: { docId: string; offline: boolean }): ReactNode {
  const { docId, offline } = props;
  const navigate = useNavigate();
  const reasonId = useId();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        aria-disabled={offline ? true : undefined}
        aria-describedby={offline ? reasonId : undefined}
        onClick={() => {
          if (offline) return;
          dialogActions.close();
          void navigate({ href: sendPath(docId, "send_draft") });
        }}
      >
        {WORDS.sendDraft}
      </Button>
      <p className="text-meta text-fg-muted">{WORDS.sendDifference}</p>
      {offline ? (
        <p id={reasonId} className="text-meta text-fg-muted">
          {WORDS.sendDraftNeedsConnection}
        </p>
      ) : null}
    </div>
  );
}

/** What Share holds in each state: the owner online changes access; anyone else, or the owner offline, sees the list. */
function ShareBody(props: { docId: string; view: ShareView }): ReactNode {
  const { docId, view } = props;
  const { access, owner, refusals, actions } = view;
  if (view.state === "sign_in")
    return <p className="text-ui text-fg">{WORDS.signIn}</p>;
  const editing = owner && view.state === "ready";
  return (
    <>
      {view.state === "offline" ? (
        <p className="text-ui text-fg">{WORDS.needsConnection}</p>
      ) : null}
      {editing && access !== null ? (
        <DialogDescription className="text-ui text-fg-muted">
          {WORDS.summary(access.people.length, access.links.length > 0)}
        </DialogDescription>
      ) : null}
      {editing && access !== null ? (
        <AddRow
          access={access}
          choices={view.choices}
          refusal={refusals.get("add") ?? null}
          actions={actions}
        />
      ) : null}
      {access === null ? (
        view.state === "ready" && view.loading ? (
          <PeopleListSkeleton />
        ) : null
      ) : (
        <PeopleList
          docId={docId}
          access={access}
          editing={editing}
          refusals={refusals}
          actions={actions}
        />
      )}
      {editing && access !== null ? (
        <LinkGroup
          links={access.links}
          refusal={refusals.get("link") ?? null}
          actions={actions}
        />
      ) : null}
      {!owner && access !== null ? (
        <p className="text-ui text-fg-muted">{WORDS.ownerOnly}</p>
      ) : null}
      {owner ? (
        <SendDraft docId={docId} offline={view.state === "offline"} />
      ) : null}
    </>
  );
}

/** Closing it, however it closes, gives focus back to what had it when Share was opened. */
export function ShareDialog(props: {
  docId: string;
  doc: DocumentServices;
}): ReactNode {
  const { dom } = useEnvironment();
  const open = useOpenDialog() === SHARE;
  const view = useShare(props.docId, props.doc, open);
  const onOpenChange = (next: boolean): void => {
    if (next) return;
    dialogActions.close();
    dom.restoreFocus();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        finalFocus={false}
        className="max-h-[calc(100dvh-4rem)] overflow-y-auto"
        style={{ maxWidth: "var(--dialog-w-wide)" }}
      >
        <DialogTitle className="text-title">
          {SELECTION_WORDS.share}
        </DialogTitle>
        <ShareBody docId={props.docId} view={view} />
        <div className="flex justify-end">
          <DialogClose render={<Button variant="outline" />}>
            {WORDS.close}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
