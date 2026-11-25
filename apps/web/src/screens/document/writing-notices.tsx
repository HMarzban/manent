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
import { readPerson, tabStorage } from "../../session.ts";
import { useAnnouncer } from "../../shell/announcer-region.tsx";
import { FactsContext } from "../../state/bridge-contexts.ts";
import type { FactsSelectors } from "../../state/facts.store.ts";
import { productionContextActions } from "../../state/production-context.store.ts";

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

/** Whether `docId`'s page numbers are locked; null until this device knows. A tab with no session has only scripts that are never locked. */
function pagesLocked(docId: string): boolean | null {
  const production = productionContextActions.get(docId);
  if (production !== null) return production.locked;
  return (readPerson(tabStorage())?.token ?? null) === null ? false : null;
}

/** Pushes the comfort notice unless this device has shown it for `docId`. */
function showComfort(docId: string, services: PersonServices): void {
  if (services.place.noticeShown(docId)) return;
  services.place.markNoticeShown(docId);
  const title =
    services.library.documentTitle(docId).get() ?? LIBRARY_WORDS.untitledScript;
  services.messages.push(messageFor({ kind: "past_comfort_limit", title }));
}

/**
 * Shows the comfort notice the first time `docId`'s pages, the lettered ones not counted, are past the limit on this
 * device; returns the stop. They are judged when their count changes and when it becomes known whether they are locked:
 * a locked script opens on plain pages until this device has its locks. The count held may be another script's, so one
 * past the limit only has the open editor's pages counted.
 */
function noticeComfort(
  facts: FactsSelectors,
  docId: string,
  services: PersonServices,
): () => void {
  const judge = (): void => {
    if (
      !pastComfortLimit(facts.get("pageCount")) ||
      pagesLocked(docId) === null ||
      services.place.noticeShown(docId)
    )
      return;
    void import("../../editor-host/live-editor.ts").then((registry) => {
      if (pastComfortLimit(registry.liveContentPageCount(docId)))
        showComfort(docId, services);
    });
  };
  let locked = pagesLocked(docId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const followLocks = (): void => {
    const now = pagesLocked(docId);
    if (now === locked) return;
    locked = now;
    clearTimeout(timer);
    // the editor lays its pages out under the locks only once this update has ended
    timer = setTimeout(judge);
  };
  const stops = [
    facts.subscribe("pageCount", judge),
    productionContextActions.subscribe(followLocks),
  ];
  return () => {
    for (const stop of stops) stop();
    clearTimeout(timer);
  };
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
