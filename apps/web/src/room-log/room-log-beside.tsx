// Room log Beside body: its own tag bar (landed, showrunner, joke, future) above the mounted room log editor.
import { Button, ROOM_LOG_WORDS, useSubscribable } from "@manent/ui";
import type { RoomLogTagWord } from "@manent/ui";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { registerBesideFacts } from "../beside/beside-facts.ts";
import { mountBesideEditor } from "../editor-host/beside-editor.ts";
import { useOpenDocument } from "../screens/document/open-document.ts";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createFactsStore } from "../state/facts.store.ts";
import { createOutlineStore } from "../state/outline.store.ts";
import { roomLogLine, runRoomLogTag } from "./room-log-bridge.ts";
import { followEpisodeTargets } from "./targets.ts";

const TAG_ORDER: readonly RoomLogTagWord[] = Object.freeze([
  "landed",
  "showrunner",
  "joke",
  "future",
]);

/** Beside's header title: `{episodeTitle} · Room log` when the episode is known, else the document's own title. */
export function useRoomLogTitle(docId: string): string {
  const services = useServices();
  const docTitle = useDocumentTitle(docId);
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null);
  useEffect(
    () =>
      followEpisodeTargets(services, docId, (targets) => {
        setEpisodeTitle(targets.episodeTitle);
      }),
    [services, docId],
  );
  if (episodeTitle !== null && episodeTitle !== "")
    return ROOM_LOG_WORDS.title(episodeTitle);
  return docTitle;
}

/** The four tag toggle buttons in the room log's own bar under Beside. */
function RoomLogTagBar(props: { docId: string; canEdit: boolean }): ReactNode {
  const { docId, canEdit } = props;
  const line = useSubscribable(roomLogLine(docId));
  const enabled = canEdit && line.editable && line.onLine;
  return (
    <div className="flex h-statebar shrink-0 items-center gap-2 border-b border-line bg-chrome px-3 text-ui">
      <div
        role="group"
        aria-label={ROOM_LOG_WORDS.tagsGroup}
        className="flex items-center gap-1"
      >
        {TAG_ORDER.map((tag) => {
          const active = line.tags.includes(tag);
          return (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="sm"
              aria-label={ROOM_LOG_WORDS.tagButton(tag)}
              aria-pressed={active}
              disabled={!enabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (enabled) runRoomLogTag(docId, tag);
              }}
            >
              {ROOM_LOG_WORDS.tags[tag]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function useRoomLogCanEdit(docId: string): boolean {
  const doc = useOpenDocument(docId);
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    if (doc === null) {
      setCanEdit(false);
      return undefined;
    }
    const read = (): void => {
      const status = doc.status.get();
      setCanEdit(
        status.access === "edit" && status.server !== "access_removed",
      );
    };
    read();
    return doc.status.subscribe(read);
  }, [doc]);
  return canEdit;
}

/** The room log editor beside the episode script, with its tag toggle bar and wide gutter for tag and link markers. */
export function RoomLogBeside(props: {
  docId: string;
  at: { blockId: string } | null;
}): ReactNode {
  const { docId, at } = props;
  const services = useServices();
  const { guard, frame, schedule } = useEnvironment();
  const canEdit = useRoomLogCanEdit(docId);
  const [stores] = useState(() => ({
    facts: createFactsStore({ guard, frame }),
    outline: createOutlineStore({ guard, schedule, composing: () => false }),
  }));
  const place = useRef<HTMLDivElement>(null);
  useEffect(
    () => registerBesideFacts(docId, stores.facts.selectors),
    [docId, stores],
  );
  useEffect(() => {
    const element = place.current;
    if (element === null) return undefined;
    return mountBesideEditor({
      services,
      element,
      docId,
      at,
      facts: stores.facts.writer,
      outline: stores.outline.writer,
      settings: services.openScriptStore(docId),
      guard,
    });
  }, [services, docId, at, stores, guard]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RoomLogTagBar docId={docId} canEdit={canEdit} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          ref={place}
          className="mn-desk min-h-full [--desk-gutter:12rem] [--page-zoom:1] [&>.mn-zoom]:mx-auto"
        />
      </div>
    </div>
  );
}
