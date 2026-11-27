// Library document row menu item for Move to Trash; hidden on desktop and for people without delete permission.
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  LIBRARY_FILES_WORDS,
  LIBRARY_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { requestMoveToTrash } from "../../handlers/library-files.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { readPerson, tabStorage } from "../../session.ts";
import { trashActions } from "../../state/trash.store.ts";

export function MoveToTrashRowItem(props: {
  readonly docId: string;
  readonly workspaceId: string;
}): ReactNode {
  const { docId, workspaceId } = props;
  const services = useServices();
  const { where } = useEnvironment();
  const navigate = useNavigate();
  const online = useCommandState("library.restore").enabled;
  const titleSource = useMemo(
    () => services.library.documentTitle(docId),
    [services.library, docId],
  );
  const title = useSubscribable(titleSource) ?? LIBRARY_WORDS.untitledScript;
  const signedIn = (readPerson(tabStorage())?.token ?? null) !== null;
  const [canDelete, setCanDelete] = useState<boolean>(
    () => trashActions.get(docId).canDelete,
  );

  useEffect(() => {
    if (where.shell === "desktop" || !signedIn || !online) return;
    let active = true;
    void services.trash.describe(docId).then((access) => {
      if (!active || access === null) return;
      trashActions.set(docId, { canDelete: access.canDelete });
      setCanDelete(access.canDelete);
    });
    return () => {
      active = false;
    };
  }, [where.shell, signedIn, online, docId, services.trash]);

  if (where.shell === "desktop") return null;
  if (signedIn && !canDelete) return null;

  const reason = !signedIn
    ? `${LIBRARY_FILES_WORDS.moveToTrash} — ${LIBRARY_FILES_WORDS.moveToTrashNeverSyncedReason}`
    : !online
      ? `${LIBRARY_FILES_WORDS.moveToTrash} ${LIBRARY_FILES_WORDS.moveToTrashOfflineReason}.`
      : null;

  const trashIcon = (
    <Trash2Icon aria-hidden="true" className="size-icon shrink-0" />
  );
  return (
    <>
      <DropdownMenuSeparator />
      {reason !== null ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuItem
                disabled
                variant="destructive"
                className="cursor-not-allowed"
              >
                {trashIcon}
                {LIBRARY_FILES_WORDS.moveToTrash}
              </DropdownMenuItem>
            }
          />
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer"
          onClick={() =>
            void requestMoveToTrash({
              services,
              navigate: (href) => void navigate({ href }),
              docId,
              title,
              workspaceId,
              navigateToLibrary: false,
            })
          }
        >
          {trashIcon}
          {LIBRARY_FILES_WORDS.moveToTrash}
        </DropdownMenuItem>
      )}
    </>
  );
}
