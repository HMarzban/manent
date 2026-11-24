// The one list of checks that Details and every Send form draw: each sentence after its mark, with the check's action
// when it offers one and Flag (or "Flagged for …") for editors/owners, or the sentence saying nothing needs a look.
import { Button, CHECKS_WORDS } from "@manent/ui";
import { useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { CheckMark } from "../send/check-mark.tsx";
import { useServices } from "../services/context.tsx";
import { PeopleContext } from "../state/bridge-contexts.ts";
import { useComments, useRetainComments } from "../state/comments.store.ts";
import type { PersonPresent } from "../state/people.store.ts";
import {
  detailOfCheck,
  docIdOfChecks,
  recordChecksDoc,
  useChecksVersion,
  warmChecksContext,
} from "./checks-context.ts";
import { FlagControl } from "./flag-picker.tsx";
import { CHECK_SOURCES } from "./sources.ts";
import type { Check } from "./sources.ts";

export interface FoundCheck extends Check {
  /** Unique across every source. */
  readonly key: string;
}

const NO_PEOPLE: readonly PersonPresent[] = Object.freeze([]);
const noop = (): void => {};

function useOptionalPeople(): readonly PersonPresent[] {
  const source = useContext(PeopleContext);
  return useSyncExternalStore(
    source === null ? () => noop : source.subscribe,
    source === null ? () => NO_PEOPLE : source.get,
    () => NO_PEOPLE,
  );
}

/** What every source finds in `docId` now, in the order of CHECK_SOURCES. It walks the script: never on a keystroke. */
export function findChecks(docId: string): readonly FoundCheck[] {
  warmChecksContext(docId);
  const found: FoundCheck[] = CHECK_SOURCES.flatMap((source) =>
    source
      .find(docId)
      .map((check) => ({ ...check, key: `${source.id}:${check.id}` })),
  );
  recordChecksDoc(found, docId);
  return found;
}

function LiveChecksList(props: {
  docId: string;
  initial: readonly FoundCheck[];
}): ReactNode {
  const { docId, initial } = props;
  const services = useServices();
  useRetainComments(docId, services);
  const commentsState = useComments(docId);
  const presentPeople = useOptionalPeople();
  const contextVersion = useChecksVersion(docId, services);
  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );
  // Recomputes when async inputs (names, targetPages, lastSent) arrive or when `initial` refreshes, never on keystrokes.
  const checks = useMemo(
    () => (contextVersion === 0 ? initial : findChecks(docId)),
    [docId, initial, contextVersion],
  );
  if (checks.length === 0)
    return <p className="text-ui text-fg-muted">{CHECKS_WORDS.nothing}</p>;
  const canFlag =
    commentsState.canEdit &&
    commentsState.access === "edit" &&
    editor !== null &&
    editor.editable;
  return (
    <ul className="flex flex-col gap-2">
      {checks.map(({ key, sentence, action }) => {
        const detail = detailOfCheck(docId, key);
        return (
          <li key={key} className="flex items-start gap-2">
            <CheckMark ok={false} />
            <span className="min-w-0 flex-1">{sentence}</span>
            {action === null ? null : (
              <Button variant="outline" size="sm" onClick={action.run}>
                {action.label}
              </Button>
            )}
            <FlagControl
              docId={docId}
              checkKey={key}
              sentence={sentence}
              subject={detail?.subject ?? sentence}
              anchor={detail?.anchor ?? null}
              canFlag={canFlag}
              flags={commentsState.flags}
              threads={commentsState.threads}
              knownPeople={commentsState.people}
              presentPeople={presentPeople}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function ChecksList(props: {
  checks: readonly FoundCheck[];
}): ReactNode {
  const { checks } = props;
  const docId = docIdOfChecks(checks);
  if (docId !== null) return <LiveChecksList docId={docId} initial={checks} />;
  if (checks.length === 0)
    return <p className="text-ui text-fg-muted">{CHECKS_WORDS.nothing}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {checks.map(({ key, sentence, action }) => (
        <li key={key} className="flex items-start gap-2">
          <CheckMark ok={false} />
          <span className="min-w-0 flex-1">{sentence}</span>
          {action === null ? null : (
            <Button variant="outline" size="sm" onClick={action.run}>
              {action.label}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
