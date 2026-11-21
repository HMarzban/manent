import { Plugin, PluginKey } from "prosemirror-state";

export const changesKey = new PluginKey("changes");

export function changesPlugin(): Plugin {
  return new Plugin({ key: changesKey });
}
