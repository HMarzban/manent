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
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { LogInIcon, SendIcon, WifiOffIcon, XIcon } from "lucide-react";
import { useId, useMemo } from "react";
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

function ShareSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div
        aria-hidden="true"
        className="flex items-center gap-2 rounded-surface border border-line bg-subtle p-3"
      >
        <Skeleton className="h-control min-w-0 flex-1" />
        <Skeleton className="h-control w-28 shrink-0" />
        <Skeleton className="h-control w-14 shrink-0" />
      </div>
      <div aria-hidden="true" className="mn-table flex flex-col">
        {Array.from({ length: PLACEHOLDER_PEOPLE }, (_, index) => (
          <div
            key={index}
            className={
              index > 0
                ? "flex min-h-row-2 items-center gap-2 border-t border-line px-3 py-2"
                : "flex min-h-row-2 items-center gap-2 px-3 py-2"
            }
          >
            <Skeleton className="size-avatar shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-control w-24 shrink-0" />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col gap-3 rounded-surface border border-line bg-raised p-4"
      >
        <Skeleton className="h-3 w-12" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-avatar shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <Skeleton className="h-4 w-7 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function NoticeBanner(props: { icon: ReactNode; text: string }): ReactNode {
  return (
    <div className="flex items-center gap-2 rounded-surface border border-line bg-subtle px-4 py-3 text-ui text-fg">
      <span aria-hidden="true" className="flex shrink-0 text-fg-muted">
        {props.icon}
      </span>
      <p className="min-w-0">{props.text}</p>
    </div>
  );
}

/** Footer bar: for the owner, "Send a draft to read…" beside Close with its explanation below; otherwise Close alone. */
function ShareFooter(props: {
  docId: string;
  showSendDraft: boolean;
  offline: boolean;
}): ReactNode {
  const { docId, showSendDraft, offline } = props;
  const navigate = useNavigate();
  const reasonId = useId();
  if (!showSendDraft) {
    return (
      <div className="flex justify-end border-t border-line pt-4">
        <DialogClose render={<Button variant="outline" />}>
          {WORDS.close}
        </DialogClose>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
          <SendIcon aria-hidden="true" className="size-icon text-fg-muted" />
          {WORDS.sendDraft}
        </Button>
        <DialogClose render={<Button variant="outline" />}>
          {WORDS.close}
        </DialogClose>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">{WORDS.sendDifference}</p>
        {offline ? (
          <p id={reasonId} className="text-meta text-fg-muted">
            {WORDS.sendDraftNeedsConnection}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** What Share holds in each state: the owner online changes access; anyone else, or the owner offline, sees the list. */
function ShareBody(props: {
  docId: string;
  view: ShareView;
  colours: ReadonlyMap<string, number>;
}): ReactNode {
  const { docId, view, colours } = props;
  const { access, owner, refusals, actions } = view;
  if (view.state === "sign_in")
    return (
      <NoticeBanner
        icon={<LogInIcon className="size-icon" />}
        text={WORDS.signIn}
      />
    );
  const editing = owner && view.state === "ready";
  return (
    <>
      {view.state === "offline" ? (
        <NoticeBanner
          icon={<WifiOffIcon className="size-icon" />}
          text={WORDS.needsConnection}
        />
      ) : null}
      {editing && access !== null ? (
        <AddRow
          access={access}
          choices={view.choices}
          colours={colours}
          refusal={refusals.get("add") ?? null}
          actions={actions}
        />
      ) : null}
      {access === null ? (
        view.state === "ready" && view.loading ? (
          <ShareSkeleton />
        ) : null
      ) : (
        <PeopleList
          docId={docId}
          access={access}
          editing={editing}
          colours={colours}
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
  const people = useSubscribable(props.doc.people);
  const colours = useMemo(
    () => new Map(people.map((person) => [person.userId, person.colour])),
    [people],
  );
  const editing = view.owner && view.state === "ready";
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
        className="max-h-[calc(100dvh-4rem)] w-[calc(100%-1.5rem)] gap-4 overflow-y-auto p-6"
        style={{ maxWidth: "var(--dialog-w-wide)" }}
      >
        <div className="flex flex-col gap-1 pe-8">
          <DialogTitle className="text-title font-semibold">
            {SELECTION_WORDS.share}
          </DialogTitle>
          {editing && view.access !== null ? (
            <DialogDescription className="text-ui text-fg-muted">
              {WORDS.summary(
                view.access.people.length,
                view.access.links.length > 0,
              )}
            </DialogDescription>
          ) : null}
        </div>
        <ShareBody docId={props.docId} view={view} colours={colours} />
        <ShareFooter
          docId={props.docId}
          showSendDraft={view.owner && view.state !== "sign_in"}
          offline={view.state === "offline"}
        />
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4"
              aria-label={WORDS.close}
            />
          }
        >
          <XIcon
            aria-hidden="true"
            className="size-icon text-fg-muted group-hover/button:text-fg"
          />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
