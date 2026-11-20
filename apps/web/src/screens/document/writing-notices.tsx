// What the open script says without being asked: the element, the page and the people as they change, and, once,
// that it is longer than this device handles comfortably.
import { LIBRARY_WORDS, messageFor, useSetting } from "@manent/ui";
import { useContext, useEffect } from "react";
import { pastComfortLimit } from "../../editor-host/comfort.ts";
import type { LiveEditor } from "../../editor-host/live-editor.ts";
import {
  announcementsFor,
  peopleAnnouncements,
} from "../../editor-host/writing-announcer.ts";
import type {
  AnnounceSetting,
  WritingFacts,
} from "../../editor-host/writing-announcer.ts";
import { useServices } from "../../services/context.tsx";
import type { PersonServices } from "../../services/ports.ts";
import { useAnnouncer } from "../../shell/announcer-region.tsx";
import { FactsContext } from "../../state/bridge-contexts.ts";
import type { FactsSelectors } from "../../state/facts.store.ts";

type Say = (text: string) => void;
// the people present, as the editor names them; a component never imports the editor's package
type People = Parameters<typeof peopleAnnouncements>[2];

const NO_FACTS: WritingFacts = Object.freeze({ element: null, page: null });

const noop = (): void => {};

/**
 * Says the element and the page as their facts change; returns the stop. The facts outlive an editor, so what they
 * hold when a script opens may be another script's: the first facts heard are its own, and are not said.
 */
function announceFacts(
  facts: FactsSelectors,
  setting: AnnounceSetting,
  say: Say,
): () => void {
  let last = NO_FACTS;
  const follow = (): void => {
    const now = { element: facts.get("element"), page: facts.get("page") };
    for (const text of announcementsFor(setting, last, now)) say(text);
    last = now;
  };
  const stops = [
    facts.subscribe("element", follow),
    facts.subscribe("page", follow),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * Says who arrives at and leaves the open editor of `docId`, following it through each rebuild; returns the stop. The
 * editors' registry is loaded apart, as the editor is: it holds the editor's code, which the frame never waits for.
 */
function announcePeople(
  docId: string,
  setting: AnnounceSetting,
  say: Say,
): () => void {
  let last: People = [];
  let watched: LiveEditor | null = null;
  let stopWatching = noop;
  let stopFollowing = noop;
  let stopped = false;
  void import("../../editor-host/live-editor.ts").then((registry) => {
    if (stopped) return;
    const follow = (): void => {
      const live = registry.liveEditor(docId);
      if (live === watched) return;
      stopWatching();
      watched = live;
      stopWatching =
        live?.presence.subscribePeople((people) => {
          for (const text of peopleAnnouncements(setting, last, people))
            say(text);
          last = people;
        }) ?? noop;
    };
    follow();
    stopFollowing = registry.subscribeLiveEditors(follow);
  });
  return () => {
    stopped = true;
    stopFollowing();
    stopWatching();
  };
}

/**
 * Pushes the comfort notice the first time a page count heard for `docId` is past the limit on this device; returns
 * the stop. Only a change is heard, because the count held when the script opens may be another script's.
 */
function noticeComfort(
  facts: FactsSelectors,
  docId: string,
  services: PersonServices,
): () => void {
  return facts.subscribe("pageCount", (pageCount) => {
    if (!pastComfortLimit(pageCount) || services.place.noticeShown(docId))
      return;
    services.place.markNoticeShown(docId);
    const title =
      services.library.documentTitle(docId).get() ??
      LIBRARY_WORDS.untitledScript;
    services.messages.push(messageFor({ kind: "past_comfort_limit", title }));
  });
}

/** Draws nothing: says what changes while `docId` is written in, through the shell's polite announcer, and tells once when it passes the comfort limit. */
export function WritingNotices(props: { docId: string }): null {
  const { docId } = props;
  const services = useServices();
  const facts = useContext(FactsContext);
  const setting = useSetting("writing.announce");
  const announcer = useAnnouncer();
  useEffect(() => {
    if (facts === null) return;
    const say: Say = (text) => announcer.announce(text, "polite");
    const stops = [
      announceFacts(facts, setting, say),
      announcePeople(docId, setting, say),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, [facts, setting, announcer, docId]);
  useEffect(
    () => (facts === null ? undefined : noticeComfort(facts, docId, services)),
    [facts, docId, services],
  );
  return null;
}
