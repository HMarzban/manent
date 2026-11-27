// What a search in Preferences finds: preferences by their words, pointers to what lives elsewhere, and commands.
import { COMMANDS } from "@manent/commands";
import type { CommandDefinition, CommandId } from "@manent/commands";
import type { SETTINGS, SearchPointer, SettingKey } from "@manent/settings";

export type SearchResult =
  | { kind: "preference"; key: SettingKey }
  | { kind: "command"; id: CommandId }
  | { kind: "pointer"; pointer: SearchPointer };

/** Lower case, with runs of spaces made one, so "  Night  MODE " finds "night mode". */
const normalise = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

export const isCommandId = (id: string): id is CommandId =>
  COMMANDS.some((def) => def.id === id);

const isFound = (query: string, words: readonly string[]): boolean =>
  words.some((word) => normalise(word).includes(query));

/** The commands a person may look for by name; a setting's own commands and Preferences pane jumps are found as preferences. */
const isSearchedCommand = (def: CommandDefinition): boolean =>
  def.setting === null &&
  "keywords" in def.palette &&
  !def.id.startsWith("app.preferences");

/**
 * What `query` finds, each list in registry order: the preferences whose label, help text, values or synonyms hold it;
 * the pointers to where a thing lives, and the answers saying why there is nothing to set, by label or synonym; and
 * the commands by label or synonym. An empty query finds nothing.
 */
export function searchPreferences(
  query: string,
  options: {
    registry: typeof SETTINGS;
    commands: readonly CommandDefinition[];
  },
): {
  preferences: readonly SettingKey[];
  elsewhere: readonly SearchPointer[];
  answers: readonly SearchPointer[];
  commands: readonly CommandId[];
} {
  const q = normalise(query);
  if (q === "")
    return { preferences: [], elsewhere: [], answers: [], commands: [] };
  const { registry, commands } = options;
  const pointers = registry.pointers.filter((pointer) =>
    isFound(q, [pointer.label, ...pointer.keywords]),
  );
  return {
    preferences: registry.all
      .filter((def) => def.surfaces.some((s) => s.in === "preferences"))
      .filter((def) =>
        isFound(q, [
          def.label,
          def.description ?? "",
          ...(def.type.choices ?? []).map((choice) => choice.label),
          ...def.keywords,
        ]),
      )
      .map((def) => def.key),
    elsewhere: pointers.filter((pointer) => pointer.kind === "elsewhere"),
    answers: pointers.filter((pointer) => pointer.kind === "answer"),
    commands: commands
      .filter(isSearchedCommand)
      .filter((def) =>
        isFound(q, [
          typeof def.label === "string" ? def.label : "",
          ...("keywords" in def.palette ? def.palette.keywords : []),
        ]),
      )
      .map((def) => def.id)
      .filter(isCommandId),
  };
}
