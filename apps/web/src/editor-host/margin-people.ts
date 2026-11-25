// Other people in the margin, in the Scenes tab and among the people present, from this person's presence while it is
// live, and whose cursors the page draws: everyone's with Show other people's cursors on, else only the person this
// person follows.
import {
  cursorsKey,
  marginPeoplePlugin as editorMarginPeoplePlugin,
} from "@manent/editor";
import type {
  EditorView,
  Plugin,
  PresentPerson,
  RemoteCursor,
  ScenePerson,
  ShownCursors,
} from "@manent/editor";
import type { SettingsStore } from "@manent/settings";
import { joinNames } from "@manent/ui";
import { initialsOf } from "../initials.ts";
import { followed } from "../room/follow-state.ts";
import { whileLive } from "../room/margin-people-live.ts";
import { showPeopleInScenes } from "../room/margin-people-scenes.ts";
import { showPeoplePresent } from "../room/people-present.ts";
import type { SceneMark } from "../screens/document/scene-marks.ts";
import type { PersonPresent } from "../state/people.store.ts";
import type { EditorPluginContext } from "./plugins.ts";

export { scrollToPerson, setShownCursors } from "@manent/editor";

/** Every cursor the page last received, drawn or not. */
export function remoteCursorsOf(view: EditorView): readonly RemoteCursor[] {
  return cursorsKey.getState(view.state)?.cursors ?? [];
}

const personMark = ({ cursor, moving }: ScenePerson): SceneMark => ({
  kind: "person",
  userId: cursor.userId,
  initials: cursor.initials,
  colour: cursor.colour,
  name: cursor.name,
  moving,
});

const personPresent = (person: PresentPerson): PersonPresent => ({
  ...person,
  initials: initialsOf(person.name),
});

function shownIn(settings: SettingsStore, docId: string): ShownCursors {
  if (settings.get("writing.showCursors")) return "everyone";
  const who = followed.get();
  return who !== null && who.docId === docId ? [who.userId] : [];
}

export function marginPeoplePlugin(context: EditorPluginContext): Plugin {
  const { docId, services, presence } = context;
  const { documents, settings } = services;
  return editorMarginPeoplePlugin({
    // the people present are told for as long as the page's cursors are
    subscribe(listener) {
      const { status } = documents.open(docId);
      const stopPeople = whileLive(
        presence.subscribePeople,
        status,
      )((people) => showPeoplePresent(docId, people.map(personPresent)));
      const stopCursors = whileLive(presence.subscribe, status)(listener);
      return () => {
        stopCursors();
        stopPeople();
        showPeoplePresent(docId, []);
        documents.close(docId);
      };
    },
    name: joinNames,
    zoom: () => context.zoom(),
    frames: context.frames,
    onScenes: (scenes) =>
      showPeopleInScenes(
        docId,
        new Map(
          [...scenes].map(([id, people]) => [id, people.map(personMark)]),
        ),
      ),
    shown: {
      get: () => shownIn(settings, docId),
      subscribe(listener) {
        const stopSetting = settings.subscribe("writing.showCursors", listener);
        const stopFollowed = followed.subscribe(listener);
        return () => {
          stopSetting();
          stopFollowed();
        };
      },
    },
  });
}
