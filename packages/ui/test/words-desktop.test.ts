import { expect, test } from "bun:test";
import { DESKTOP_WORDS } from "../src/index.ts";

test("the desktop's sentences are fixed", () => {
  const D = DESKTOP_WORDS;
  expect({
    handoffRefused: D.handoffRefused(
      "The Lamp Room",
      D.handoffReason.forbidden,
    ),
    handoffReason: D.handoffReason,
    scriptsRow: D.scriptsRow,
    folderRow: D.folderRow,
    channelRow: D.channelRow,
    fileWrongType: D.fileWrongType("notes.txt"),
    fileTooLarge: D.fileTooLarge("draft.pdf"),
  }).toEqual({
    handoffRefused:
      "Couldn't sync 'The Lamp Room': you can't add scripts to this workspace. It stays on this device only.",
    handoffReason: {
      forbidden: "you can't add scripts to this workspace",
      deleted: "it was deleted on the server",
      exists_elsewhere:
        "the server already holds a different script with its identity",
      invalid: "Manent couldn't read part of it",
      too_large: "Manent couldn't read part of it",
    },
    scriptsRow: "Scripts",
    folderRow: "Folder",
    channelRow: "Channel",
    fileWrongType:
      "Couldn't open 'notes.txt': Manent opens .fdx, .fountain, .pdf, .docx and .ink files.",
    fileTooLarge: "Couldn't open 'draft.pdf': it is larger than 32 MB.",
  });
});

test("a stored size is whole megabytes, never less than one", () => {
  expect(
    [0, 200_000, 23_000_000, 23_499_999, 1_234_500_000].map(
      DESKTOP_WORDS.storedSize,
    ),
  ).toEqual(["1 MB", "1 MB", "23 MB", "23 MB", "1,235 MB"]);
});
