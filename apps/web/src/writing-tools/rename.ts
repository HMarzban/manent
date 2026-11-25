// Two-step palette ask flow for Rename character.
import { WRITING_TOOLS_WORDS, messageFor } from "@manent/ui";
import type { HandlerDeps } from "../handlers/index.ts";
import { paletteActions } from "../state/palette.store.ts";

/** Opens the two-step Rename character ask flow for the open script. */
export function startRenameCharacter(deps: HandlerDeps): void {
  const docId = deps.shellState().docId;
  if (docId === null) return;
  void import("../editor-host/character-names.ts").then(
    ({ characterNamesOf, countCharacterCues }) => {
      if (deps.shellState().docId !== docId) return;
      const names = characterNamesOf(docId);
      if (names.length === 0) {
        deps.services.messages.push(
          messageFor({
            kind: "command_unavailable",
            label: WRITING_TOOLS_WORDS.renameCharacter,
            reason: WRITING_TOOLS_WORDS.needsCharacter,
          }),
        );
        return;
      }
      paletteActions.ask({
        prompt: WRITING_TOOLS_WORDS.renameWhich,
        choices: names,
        initial: "",
        submit(from) {
          if (deps.shellState().docId !== docId) return;
          const picked = from.trim();
          if (picked === "") return;
          paletteActions.ask({
            prompt: WRITING_TOOLS_WORDS.renameNewName(picked),
            choices: null,
            initial: picked,
            submit(to) {
              if (deps.shellState().docId !== docId) return;
              const next = to.trim();
              if (next === "" || next.toLowerCase() === picked.toLowerCase())
                return;
              const count = countCharacterCues(docId, picked);
              const result = deps.services.editor.run({
                kind: "rename_character",
                from: picked,
                to: next,
              });
              if (result?.ok) {
                deps.services.messages.push({
                  id: "character_renamed",
                  text: WRITING_TOOLS_WORDS.renamed(picked, next, count),
                  actions: [
                    {
                      label: WRITING_TOOLS_WORDS.undo,
                      commandId: "edit.undo",
                    },
                  ],
                  lifetime: "reverse",
                  ownWork: false,
                });
              }
            },
          });
        },
      });
    },
  );
}
