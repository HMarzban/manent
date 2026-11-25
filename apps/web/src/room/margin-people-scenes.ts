// An avatar on a Scenes row for each person whose caret is in that scene, as the margin-people plugin tells them.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { SceneMark } from "../screens/document/scene-marks.ts";

type SceneMarks = ReadonlyMap<string, readonly SceneMark[]>;

interface Entry {
  readonly value: ReturnType<typeof createValue<SceneMarks>>;
  readonly view: Subscribable<SceneMarks>;
  subscribers: number;
}

const scenes = new Map<string, Entry>();

function prune(docId: string, entry: Entry): void {
  if (entry.subscribers === 0 && entry.value.get().size === 0)
    scenes.delete(docId);
}

function entryOf(docId: string): Entry {
  const known = scenes.get(docId);
  if (known !== undefined) return known;
  const value = createValue<SceneMarks>(new Map());
  const entry: Entry = {
    value,
    subscribers: 0,
    view: {
      get: () => value.get(),
      subscribe(listener) {
        entry.subscribers += 1;
        const stop = value.subscribe(listener);
        return () => {
          stop();
          entry.subscribers -= 1;
          prune(docId, entry);
        };
      },
    },
  };
  scenes.set(docId, entry);
  return entry;
}

/** The people in each scene of `docId`, by the block id of its heading. */
export function marginPeopleScenes(docId: string): Subscribable<SceneMarks> {
  return entryOf(docId).view;
}

/** For the margin-people plugin only: the people now in each scene of `docId`. */
export function showPeopleInScenes(docId: string, marks: SceneMarks): void {
  if (marks.size === 0) {
    const known = scenes.get(docId);
    if (known === undefined) return;
    known.value.set(marks);
    prune(docId, known);
    return;
  }
  entryOf(docId).value.set(marks);
}
