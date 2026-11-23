// Other people in the margin and in the Scenes tab, from this person's presence while it is live, and whose cursors
// the page draws: everyone's with Show other people's cursors on, else only the person this person follows.
import {
  cursorsKey,
  marginPeoplePlugin as editorMarginPeoplePlugin,
} from "@manent/editor";
import type {
  EditorView,
  Plugin,
  RemoteCursor,
  ShownCursors,
} from "@manent/editor";
import type { SettingsStore } from "@manent/settings";
import { joinNames } from "@manent/ui";
import { followed } from "../room/follow-state.ts";
import { showPeopleInScenes } from "../room/margin-people-scenes.ts";
import type { SceneMark } from "../screens/document/scene-marks.ts";
import { whileLive } from "../state/people.store.ts";
import type { EditorPluginContext } from "./plugins.ts";

export { scrollToPerson } from "@manent/editor";

/** Every cursor the page last received, drawn or not. */
export function remoteCursorsOf(view: EditorView): readonly RemoteCursor[] {
  return cursorsKey.getState(view.state)?.cursors ?? [];
}

const personMark = (cursor: RemoteCursor): SceneMark => ({
  kind: "person",
  userId: cursor.userId,
  initials: cursor.initials,
  colour: cursor.colour,
  name: cursor.name,
});

function shownIn(settings: SettingsStore, docId: string): ShownCursors {
  if (settings.get("writing.showCursors")) return "everyone";
  const who = followed.get();
  return who !== null && who.docId === docId ? [who.userId] : [];
}

export function marginPeoplePlugin(context: EditorPluginContext): Plugin {
  const { docId, services, presence } = context;
  const { settings } = services;
  const { status } = services.documents.open(docId);
  return editorMarginPeoplePlugin({
    subscribe: whileLive(presence.subscribe, status),
    name: joinNames,
    zoom: () => context.zoom(),
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
