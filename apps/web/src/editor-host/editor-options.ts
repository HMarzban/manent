// The options a person's script editor is made with.
import type {
  EditorBinding,
  Frames,
  PageViewPorts,
  ScriptEditorOptions,
  Timers,
} from "@manent/editor";
import { ENGINE_VERSION, engineFor } from "@manent/pagination";
import type { IdSource } from "@manent/schema";
import type { Platform } from "@manent/settings";
import { LIBRARY_WORDS } from "@manent/ui";
import type { KeyResolver } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { zoomActions } from "../state/zoom.store.ts";
import type { EditorMount } from "./mount.ts";
import { createPastedText } from "./pasted-text.ts";
import { EDITOR_PLUGINS } from "./plugins.ts";

/** What every build of a person's script editors is given. */
export interface EditorSources {
  services: () => PersonServices;
  keys: { resolve: KeyResolver; run(id: string): boolean };
  ports: PageViewPorts;
  frames: Frames;
  timers: Timers;
  platform: Platform;
  ids: IdSource;
  random: () => string;
}

/** What an opened script gives each build of its editor. */
export interface OpenedScript {
  ports: Parameters<EditorMount["mount"]>[0];
  script: ScriptEditorOptions["script"];
  words: ScriptEditorOptions["words"];
  desk: ScriptEditorOptions["desk"];
}

/** The script editor's options for one build over `bound`'s binding, at the person's zoom. */
export function editorOptions(
  options: EditorSources,
  open: OpenedScript,
  bound: { binding: EditorBinding; editable: boolean },
): ScriptEditorOptions {
  const { element, docId, facts, outline, settings, guard } = open.ports;
  const { services } = options;
  const title = services().library.documentTitle(docId);
  return {
    place: element,
    binding: bound.binding,
    editable: bound.editable,
    personal: settings,
    script: open.script,
    // every script is laid out by the first engine until a script stores its own
    layoutEngine: engineFor(ENGINE_VERSION)!,
    facts,
    outline,
    guard,
    words: open.words,
    frames: options.frames,
    timers: options.timers,
    ports: options.ports,
    platform: options.platform,
    ids: options.ids,
    random: options.random,
    pastedText: createPastedText({
      ids: options.ids,
      messages: services().messages,
    }),
    onUndoStep: () => services().messages.withdrawUndo(),
    title: {
      get: () => title.get() ?? LIBRARY_WORDS.untitledScript,
      subscribe: (listener) => title.subscribe(listener),
    },
    keys: options.keys,
    zoom: zoomActions.get(),
    desk: open.desk,
    extraPlugins: (host) =>
      EDITOR_PLUGINS.map((make) =>
        make({ ...host, docId, services: services(), facts }),
      ),
  };
}
