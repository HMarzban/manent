// The script editor's plugins: those before the typesetting ones, and those after them.
import { FORMAT_ELEMENTS } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import { Plugin } from "prosemirror-state";
import { bridgePlugin } from "../bridge/bridge-plugin.ts";
import { completePlugin } from "../complete/complete-plugin.ts";
import { cursorsPlugin } from "../cursors/cursor-plugin.ts";
import { plainTextElement } from "../elements/slots.ts";
import { findPlugin } from "../find/find-plugin.ts";
import { clipboardPlugin } from "../identity/clipboard.ts";
import { idRegistryPlugin } from "../identity/id-registry.ts";
import { commandKeymap } from "../keys/command-keymap.ts";
import { detectPlugin } from "../keys/detect.ts";
import { elementKeysPlugin } from "../keys/element-keys.ts";
import type { ElementContext } from "../keys/element-keys.ts";
import { historyKeysPlugin } from "../keys/history-keys.ts";
import { pickerPlugin } from "../picker/picker-plugin.ts";
import { placeholderPlugin } from "../picker/placeholder.ts";
import { scrollPlugin } from "../scroll/stability.ts";
import type { ScrollPorts } from "../scroll/stability.ts";
import { sourcePlugin } from "../source/source-plugin.ts";
import type { ScriptEditorOptions } from "./create.ts";

const READ_ONLY_ATTRIBUTES: Readonly<Record<string, string>> = Object.freeze({
  tabindex: "0",
  "aria-readonly": "true",
});

/** The page is one multiline textbox named by the script's title; a read-only one is focusable and says so. */
function pageAttributes(
  options: ScriptEditorOptions,
  isEditable: () => boolean,
): Record<string, string> {
  return {
    role: "textbox",
    "aria-multiline": "true",
    "aria-label": options.title.get(),
    ...(isEditable() ? {} : READ_ONLY_ATTRIBUTES),
  };
}

/** The plugins before the typesetting ones, and those after them. */
export function editorPlugins(
  options: ScriptEditorOptions,
  parts: {
    layer: HTMLElement;
    format(): FormatId;
    context: ElementContext;
    ports: ScrollPorts;
    paged: boolean;
    extra: readonly Plugin[];
    isEditable?: () => boolean;
  },
): { before: Plugin[]; after: Plugin[] } {
  const { binding, words, frames, timers, ids, personal } = options;
  const { layer, format, context } = parts;
  const isEditable = parts.isEditable ?? (() => options.editable);
  const before = [
    ...binding.plugins,
    pickerPlugin({ format, words, layer, frames }),
    completePlugin({
      layer,
      frames,
      timers,
      projectNames: options.projectNames ?? [],
    }),
    commandKeymap(options.keys),
    historyKeysPlugin({ history: binding.history, platform: options.platform }),
    elementKeysPlugin(context),
    detectPlugin(context),
    clipboardPlugin({
      ids,
      random: options.random,
      isUndoRedo: binding.isUndoRedo,
      history: binding.history,
      pastedText: options.pastedText,
      plainElement: () => plainTextElement(format()),
      formatElements: () => FORMAT_ELEMENTS[format()],
    }),
    new Plugin({
      props: { attributes: () => pageAttributes(options, isEditable) },
    }),
  ];
  const after = [
    // the registry counts from the pagination plugin's block index
    ...(parts.paged
      ? [idRegistryPlugin({ ids, isRemote: binding.isRemote })]
      : []),
    placeholderPlugin({ format, words }),
    sourcePlugin({ format, layer }),
    findPlugin(),
    cursorsPlugin({
      presence: binding.presence,
      frames,
      timers,
      isRemote: binding.isRemote,
    }),
    scrollPlugin({
      ...parts.ports,
      isRemote: binding.isRemote,
      typewriter: () => personal.get("writing.typewriterScrolling") === true,
    }),
    bridgePlugin({
      facts: options.facts,
      outline: options.outline,
      history: binding.history,
      words,
      format,
      frames,
      timers,
    }),
    ...parts.extra,
  ];
  return { before, after };
}
