// Other people in the margin and in the Scenes tab, from this person's presence while it is live.
import { marginPeoplePlugin as editorMarginPeoplePlugin } from "@manent/editor";
import type { Plugin, RemoteCursor } from "@manent/editor";
import { joinNames } from "@manent/ui";
import { showPeopleInScenes } from "../room/margin-people-scenes.ts";
import type { SceneMark } from "../screens/document/scene-marks.ts";
import { whileLive } from "../state/people.store.ts";
import type { EditorPluginContext } from "./plugins.ts";

const personMark = (cursor: RemoteCursor): SceneMark => ({
  kind: "person",
  userId: cursor.userId,
  initials: cursor.initials,
  colour: cursor.colour,
  name: cursor.name,
});

export function marginPeoplePlugin(context: EditorPluginContext): Plugin {
  const { docId, services, presence } = context;
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
  });
}
