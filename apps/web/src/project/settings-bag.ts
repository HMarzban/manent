// The project scope's settings, kept in the project's index: the element style in its `style` map, the ladder in its
// `ladder` map and every other project setting in its `template` map, each under its setting key.
import { writeProjectKey } from "@manent/crdt";
import type { JsonMapView, ProjectIndexMap } from "@manent/crdt";
import { SETTINGS, UNSET } from "@manent/settings";
import type { Bag, SettingValue } from "@manent/settings";
import type { SyncClient } from "@manent/sync-client";
import { indexDocId, projectHome } from "@manent/sync-protocol";
import type { LibraryIndex, ProjectKind } from "../services/ports.ts";
import type { ProjectCreated } from "../services/sync/library-index.ts";
import { openProjectIndex } from "./project-index.ts";
import type { ProjectIndex } from "./project-index.ts";

type Listener = Parameters<Bag["subscribe"]>[0];

const SETTINGS_MAPS = [
  "template",
  "style",
  "ladder",
] as const satisfies readonly ProjectIndexMap[];
type SettingsMap = (typeof SETTINGS_MAPS)[number];
type Views = Readonly<Record<SettingsMap, JsonMapView>>;

const OWN_MAPS: Readonly<Record<string, SettingsMap>> = Object.freeze({
  "project.style": "style",
  "project.ladder": "ladder",
});
const mapOf = (key: string): SettingsMap => OWN_MAPS[key] ?? "template";

const PROJECT_KEYS: readonly string[] = Object.freeze(
  SETTINGS.byScope("project").map((def) => def.key),
);
const NOTHING: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * The project settings of the script `docId`, following `library.documentProject(docId)` and opening that
 * project's index while subscribed. Reads empty and refuses writes while `docId` belongs to no project.
 */
export function projectSettingsBag(options: {
  docId: string;
  client: Promise<SyncClient>;
  library: LibraryIndex;
}): Bag {
  const { docId, client, library } = options;
  const projectSub = library.documentProject(docId);
  const listeners = new Set<Listener>();
  let currentId: string | null = null;
  let held: { index: ProjectIndex; bag: Bag; stopBag: () => void } | null =
    null;
  let stopProject: (() => void) | null = null;

  const tell: Listener = (keys, origin) => {
    for (const listener of listeners) listener(keys, origin);
  };

  const closeHeld = (): void => {
    if (held === null) return;
    held.stopBag();
    void held.index.close();
    held = null;
    currentId = null;
  };

  const syncToProject = (nextId: string | null, notify: boolean): void => {
    if (nextId === currentId) return;
    closeHeld();
    if (nextId !== null) {
      const index = openProjectIndex({ client, projectId: nextId });
      const bag = createProjectSettingsBag({ index });
      const stopBag = bag.subscribe((keys, origin) => tell(keys, origin));
      held = { index, bag, stopBag };
      currentId = nextId;
    }
    if (notify) tell(PROJECT_KEYS, "remote");
  };

  return Object.freeze({
    read: () => held?.bag.read() ?? NOTHING,
    provenance: (key: string) => held?.bag.provenance(key) ?? null,
    write(patch: Readonly<Record<string, unknown>>): void {
      held?.bag.write(patch);
    },
    subscribe(listener: Listener): () => void {
      if (listeners.size === 0) {
        syncToProject(projectSub.get(), false);
        stopProject = projectSub.subscribe(() => {
          syncToProject(projectSub.get(), true);
        });
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopProject?.();
          stopProject = null;
          closeHeld();
        }
      };
    },
    canWrite: (key: string) => held?.bag.canWrite(key) ?? false,
  });
}

/** Every key of `views` that its own map holds, so a key written into the wrong map is never read. */
function valuesOf(views: Views): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      SETTINGS_MAPS.flatMap((name) =>
        Object.entries(views[name].entries()).filter(
          ([key]) => mapOf(key) === name,
        ),
      ),
    ),
  );
}

/**
 * The project settings kept in `index`. It holds no value and refuses every write until the index's maps are read,
 * then tells every project setting as changed from elsewhere. A key holds a value only once it has been set, so a
 * setting the project never set reads its default. The maps record no one, so `provenance` is null.
 */
export function createProjectSettingsBag(options: {
  index: ProjectIndex;
}): Bag {
  const { index } = options;
  const listeners = new Set<Listener>();
  let views: Views | null = null;
  let values = NOTHING;
  const tell: Listener = (keys, origin) => {
    for (const listener of listeners) listener(keys, origin);
  };
  const follow = (held: Views): void => {
    for (const name of SETTINGS_MAPS)
      held[name].subscribe((keys, origin) => {
        values = valuesOf(held);
        const own = keys.filter((key) => mapOf(key) === name);
        if (own.length > 0) tell(own, origin);
      });
  };
  void Promise.all([
    index.map("template"),
    index.map("style"),
    index.map("ladder"),
  ]).then(
    ([template, style, ladder]) => {
      const held: Views = { template, style, ladder };
      views = held;
      values = valuesOf(held);
      follow(held);
      tell(PROJECT_KEYS, "remote");
    },
    () => {
      // an index that cannot be opened leaves every project setting at its default, and none can be written
    },
  );
  return Object.freeze({
    read: () => values,
    provenance: () => null,
    write(patch: Readonly<Record<string, unknown>>): void {
      if (views === null) return;
      for (const [key, value] of Object.entries(patch)) {
        const view = views[mapOf(key)];
        if (value === UNSET) view.delete(key);
        else view.set(key, value);
      }
      values = valuesOf(views);
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    canWrite: () => views !== null,
  });
}

/** The template each kind of project starts from: a series as Drama. */
const KIND_TEMPLATES: Readonly<
  Record<ProjectKind, SettingValue<"project.template">>
> = Object.freeze({
  film: "screenplay",
  series: "drama",
  show: "variety",
  news: "news",
  podcast: "podcast",
  book: "manuscript",
  game: "game",
  stage_play: "stage_play",
});

/** A new project's template, written into its index from its kind. */
export const projectTemplateCreated: ProjectCreated = {
  id: "project_template",
  async made({ sync, workspaceId, projectId, kind }) {
    const handle = await sync.client.open(indexDocId("project", projectId), {
      create: { kind: "index", home: projectHome(projectId), workspaceId },
    });
    writeProjectKey(
      handle.doc(),
      "template",
      "project.template",
      KIND_TEMPLATES[kind],
    );
    await handle.close();
  },
  // the template is in the project's index, which stays with it
  removed: () => {},
};
