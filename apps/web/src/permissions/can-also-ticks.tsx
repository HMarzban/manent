// "Can also" permission ticks mounted in Share and Project settings → People person rows via PERSON_ROW_SLOTS.
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  WORKSPACE_WORDS,
  cn,
  createValue,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { PersonRowSlotProps } from "../sharing/person-row-slots.ts";
import {
  CAN_ALSO_TICKS,
  acquireCanAlso,
  isTickChecked,
  shortNameOf,
} from "./can-also-store.ts";
import type { CanAlsoController, CanAlsoSnapshot } from "./can-also-store.ts";

const NO_STRING: Subscribable<string | null> = createValue(null);

function useResolvedProject(place: PersonRowSlotProps["place"]): {
  projectId: string | null;
  fallbackTitle: string | null;
} {
  const { library } = useServices();
  const docProjectSub = useMemo(
    () => (place.kind === "doc" ? library.documentProject(place.docId) : null),
    [library, place],
  );
  const docTitleSub = useMemo(
    () => (place.kind === "doc" ? library.documentTitle(place.docId) : null),
    [library, place],
  );
  const docProjectId = useSubscribable(docProjectSub ?? NO_STRING);
  const docTitle = useSubscribable(docTitleSub ?? NO_STRING);
  return {
    projectId: place.kind === "project" ? place.projectId : docProjectId,
    fallbackTitle: docTitle,
  };
}

function CanAlsoForProject(props: {
  userId: string;
  projectId: string;
  fallbackTitle: string | null;
}): ReactNode {
  const { userId, projectId, fallbackTitle } = props;
  const services = useServices();
  const { tabStorage } = useEnvironment();
  const [controller, setController] = useState<CanAlsoController | null>(null);
  const [snapshot, setSnapshot] = useState<CanAlsoSnapshot | null>(null);

  useEffect(() => {
    const acquired = acquireCanAlso(services, tabStorage, projectId);
    setController(acquired);
    setSnapshot(acquired.get());
    const stop = acquired.subscribe(() => setSnapshot(acquired.get()));
    return () => {
      stop();
      acquired.release();
    };
  }, [services, tabStorage, projectId]);

  if (snapshot === null || controller === null) return null;

  const fullName = snapshot.people.get(userId) ?? userId;
  const shortName = shortNameOf(fullName);
  const canEdit = snapshot.canEdit;
  const refused = snapshot.refusedUsers.has(userId);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-tour="workspace:can_also"
            className="h-7 cursor-pointer gap-1 px-2 text-meta font-normal text-fg-muted hover:text-fg"
          />
        }
      >
        <span>{WORKSPACE_WORDS.canAlso}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-2 p-3 text-ui">
        <div className="text-ui font-medium text-fg">
          {WORKSPACE_WORDS.canAlso}
        </div>
        <div
          role="group"
          aria-label={WORKSPACE_WORDS.canAlsoGroupLabel(fullName)}
          className="flex flex-col gap-1"
        >
          {CAN_ALSO_TICKS.map((tick) => {
            const checked = isTickChecked(snapshot.entries, userId, tick);
            return (
              <label
                key={tick.id}
                title={canEdit ? undefined : WORKSPACE_WORDS.canAlsoReadOnly}
                className={cn(
                  "flex items-start gap-2 rounded-control px-1.5 py-1 text-ui select-none",
                  canEdit
                    ? "cursor-pointer text-fg hover:bg-subtle"
                    : "cursor-not-allowed text-fg-muted opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canEdit}
                  className={cn(
                    "mt-0.5 size-4 shrink-0 rounded-sm border border-line accent-accent",
                    canEdit ? "cursor-pointer" : "cursor-not-allowed",
                  )}
                  onChange={(event) => {
                    void controller.toggle(
                      userId,
                      tick,
                      event.target.checked,
                      fallbackTitle,
                    );
                  }}
                />
                <span className="leading-snug">{tick.label}</span>
              </label>
            );
          })}
        </div>
        {canEdit ? null : (
          <p className="text-meta text-fg-muted">
            {WORKSPACE_WORDS.canAlsoReadOnly}
          </p>
        )}
        {refused ? (
          <p role="alert" className="text-meta text-attention">
            {WORKSPACE_WORDS.canAlsoRefused(shortName)}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Mounted on person rows in Share and Project settings → People; renders nothing off a project. */
export function CanAlsoTicks(props: PersonRowSlotProps): ReactNode {
  const { projectId, fallbackTitle } = useResolvedProject(props.place);
  if (projectId === null) return null;
  return (
    <CanAlsoForProject
      userId={props.userId}
      projectId={projectId}
      fallbackTitle={fallbackTitle}
    />
  );
}
