// Words for Rename character and the writing tools on the Script menu.
export const WRITING_TOOLS_WORDS = Object.freeze({
  renameCharacter: "Rename character",
  renameWhich: "Rename which character?",
  renameNewName: (name: string): string => `New name for ${name}`,
  renamed: (from: string, to: string, count: number): string =>
    `Renamed ${from} to ${to} in ${count} ${count === 1 ? "cue" : "cues"}.`,
  needsCharacter: "needs a character in the script",
  undo: "Undo",
  readAloud: "Read aloud",
  readAloudNoVoice: "needs an English voice on this device",
});
