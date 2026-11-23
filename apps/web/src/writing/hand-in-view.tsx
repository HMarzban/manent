// The Hand in view of the History tab: what the person's private copy changed against the room's script, by scene and
// drawn on the page as Compare draws changes, then Hand in's consequence dialog. Its heading says what is shown, so the
// state bar keeps the privacy line.
import {
  Button,
  ConsequenceDialog,
  LIBRARY_WORDS,
  WRITING_WORDS,
  messageFor,
  useSubscribable,
} from "@manent/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { writingActions } from "../state/writing.store.ts";
import { compareCopy } from "./compare-copy.ts";
import type { CopyChanges } from "./compare-copy.ts";
import { handInShown, handedInVersions } from "./hand-in.ts";
import { handedInMessage } from "./messages.ts";
import { handInPrivateCopy } from "./requests.ts";

// the live page's changes, which reach the editor, load with it
const loadChanges = () => import("../editor-host/changes.ts");

/** The copy's changes, drawn on the live page while shown; null while they are read, or cannot be. */
function useCopyChanges(docId: string): CopyChanges | null {
  const services = useServices();
  const privateDocId = writingActions.openTarget(docId);
  const [changes, setChanges] = useState<CopyChanges | null>(null);
  useEffect(() => {
    let shown = true;
    setChanges(null);
    void compareCopy(services, docId, privateDocId).then((read) => {
      if (!shown || read === null) return;
      setChanges(read);
      void loadChanges().then(({ showChanges }) => {
        if (shown)
          showChanges(docId, {
            baseline: read.room,
            comparison: read.comparison,
            display: "page",
          });
      });
    });
    return () => {
      shown = false;
      void loadChanges().then(({ showChanges }) => showChanges(docId, null));
    };
  }, [services, docId, privateDocId]);
  return changes;
}

/** Hand in's consequence dialog: the request goes once per press, and a retry carries the same key. */
function HandInDialog(props: {
  docId: string;
  scenes: number;
  onCancel(): void;
}): ReactNode {
  const { docId, scenes } = props;
  const services = useServices();
  const { now, randomId } = useEnvironment();
  const title = useSubscribable(services.library.documentTitle(docId));
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const handIn = async (): Promise<void> => {
    // a key is 32 lower-case hex digits
    key.current ??= randomId().replaceAll("-", "");
    setBusy(true);
    setRefusal(null);
    const outcome = await handInPrivateCopy(services.userId, {
      docId,
      key: key.current,
    });
    setBusy(false);
    if (!outcome.ok) {
      setRefusal(WRITING_WORDS.handInRefusals[outcome.code]);
      return;
    }
    const { versionId, overlaps } = outcome.handedIn;
    writingActions.keep(docId, {
      position: "everyone",
      at: now(),
      privateDocId: null,
    });
    handedInVersions.set(docId, versionId);
    handInShown.set(null);
    services.messages.push(handedInMessage(outcome.handedIn.scenes, overlaps));
  };
  return (
    <ConsequenceDialog
      open
      title={WRITING_WORDS.handInTitle(scenes)}
      body={WRITING_WORDS.handInBody(
        scenes,
        title ?? LIBRARY_WORDS.untitledScript,
      )}
      action={WRITING_WORDS.handInAction(scenes)}
      busyLabel={busy ? WRITING_WORDS.handingIn(scenes) : null}
      refusal={refusal}
      destructive={false}
      onAction={() => void handIn()}
      onCancel={props.onCancel}
    />
  );
}

function HandIn(props: { docId: string }): ReactNode {
  const { docId } = props;
  const { messages } = useServices();
  const changes = useCopyChanges(docId);
  const [asking, setAsking] = useState(false);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // the view is drawn below the version list, so Hand in… brings it to the keyboard, and into sight again once its
  // changes have been read and drawn below the heading
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "start" });
  }, [changes]);
  const scenes = changes?.scenes ?? [];
  const nothing = changes !== null && scenes.length === 0;
  const press = (): void => {
    if (scenes.length > 0) setAsking(true);
    else
      messages.push(
        messageFor({
          kind: "command_unavailable",
          label: WRITING_WORDS.handIn,
          reason: WRITING_WORDS.needsChange,
        }),
      );
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 p-2">
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="mn-group-label outline-none"
      >
        {WRITING_WORDS.handInHeading}
      </h2>
      {changes === null ? null : (
        <p className="text-ui text-fg-muted">
          {nothing
            ? WRITING_WORDS.nothingToHandIn
            : WRITING_WORDS.handInLine(scenes.length)}
        </p>
      )}
      <ul className="flex flex-col">
        {scenes.map((scene) => (
          <li key={scene.sceneId} className="px-2 py-1 text-ui tabular-nums">
            {WRITING_WORDS.handInRow(scene.scene, scene.changes)}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          size="sm"
          aria-disabled={scenes.length === 0}
          disabled={changes === null}
          onClick={press}
        >
          {WRITING_WORDS.handIn}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handInShown.set(null)}
        >
          {WRITING_WORDS.keepWriting}
        </Button>
      </div>
      {asking ? (
        <HandInDialog
          docId={docId}
          scenes={scenes.length}
          onCancel={() => setAsking(false)}
        />
      ) : null}
    </section>
  );
}

/** Drawn while Hand in… has asked for it in this script and the person still writes it privately. */
export function useHandInVisible(docId: string): boolean {
  const shown = useSubscribable(handInShown);
  const position = useSubscribable(writingActions.writingPositionOf(docId));
  return shown === docId && position === "private";
}

export function HandInView(props: { docId: string }): ReactNode {
  return useHandInVisible(props.docId) ? <HandIn docId={props.docId} /> : null;
}
