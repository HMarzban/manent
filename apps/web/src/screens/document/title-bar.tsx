// The bar above the page: back to the Library, the title and its menu, the status, the people present, and Share.
import {
  Button,
  CommandMenu,
  DOCUMENT_WORDS,
  LIBRARY_WORDS,
  READOUT_WORDS,
  SELECTION_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useCommandState,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import { useRouter } from "@tanstack/react-router";
import { useId, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { useRenaming } from "../../state/rename.store.ts";
import { InlineRename } from "./inline-rename.tsx";
import { MenuFace } from "./menu-face.tsx";
import { People } from "./people.tsx";
import { StatusButton } from "./status-button.tsx";

/** When a rename ends, however it ends, focus returns to what had it when the rename began. */
function useFocusAfterRename(renaming: boolean): void {
  const { dom } = useEnvironment();
  const was = useRef(renaming);
  useLayoutEffect(() => {
    if (was.current && !renaming) dom.restoreFocus();
    was.current = renaming;
  }, [renaming, dom]);
}

/** The title of `docId` as the Library holds it, or `Untitled script` before it has one. */
export function useDocumentTitle(docId: string): string {
  const { library } = useServices();
  const titleSource = useMemo(
    () => library.documentTitle(docId),
    [library, docId],
  );
  return useSubscribable(titleSource) ?? LIBRARY_WORDS.untitledScript;
}

/**
 * Share runs `share.open`, and is drawn while the command is visible. While it cannot run it stays in the bar,
 * focusable, and says why in its tooltip and description, as a command's button does; a press then gives the reason.
 */
function ShareButton(): ReactNode {
  const { service } = useCommands();
  const state = useCommandState("share.open");
  const reasonId = useId();
  if (!state.visible) return null;
  const reason =
    state.whyNot === null
      ? null
      : READOUT_WORDS.unavailable(SELECTION_WORDS.share, state.whyNot);
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              data-tour="share"
              aria-disabled={reason === null ? undefined : true}
              aria-describedby={reason === null ? undefined : reasonId}
              onClick={() => service.run("share.open", "control")}
            />
          }
        >
          {SELECTION_WORDS.share}
        </TooltipTrigger>
        <TooltipContent>{reason ?? SELECTION_WORDS.share}</TooltipContent>
      </Tooltip>
      {reason === null ? null : (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}

/**
 * On a narrow window it yields in this order: the avatars become a count, the title shortens with an ellipsis, and
 * only then does the status take a second row. The status never shortens.
 */
export function TitleBar(props: {
  docId: string;
  doc: DocumentServices;
}): ReactNode {
  const { docId, doc } = props;
  const router = useRouter();
  const title = useDocumentTitle(docId);
  const renaming = useRenaming() === docId;
  useFocusAfterRename(renaming);
  return (
    <ShellRegion
      region="title_bar"
      className="@container flex min-h-titlebar flex-wrap items-center gap-x-2 border-b border-line bg-chrome px-2 py-1 text-ui"
    >
      <Button
        variant="ghost"
        className="text-fg-muted hover:text-fg"
        onClick={() => void router.navigate({ href: "/" })}
      >
        {DOCUMENT_WORDS.back}
      </Button>
      {/* the title's band hugs it, up to two fifths of the bar, and gives way to the status on a narrow bar */}
      <h1
        tabIndex={-1}
        className="grid max-w-max min-w-24 grow basis-24 grid-cols-[fit-content(40cqi)] text-title font-semibold *:min-w-0"
      >
        {renaming ? (
          <InlineRename docId={docId} title={title} />
        ) : (
          <CommandMenu
            menu="title"
            label={DOCUMENT_WORDS.titleMenu(title)}
            trigger={
              <MenuFace size="default" title={title}>
                {title}
              </MenuFace>
            }
          />
        )}
      </h1>
      <StatusButton doc={doc} />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <People docId={docId} people={doc.people} viewers={doc.viewers} />
        <ShareButton />
      </div>
    </ShellRegion>
  );
}
