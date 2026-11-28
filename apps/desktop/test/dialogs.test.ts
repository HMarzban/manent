import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OPENED_FILE_LIMIT_BYTES } from "@manent/sync-protocol";
import {
  chooseDirectory,
  chooseFiles,
  readOpenedPaths,
} from "../src/shell/dialogs.ts";
import type { DialogUtils } from "../src/shell/dialogs.ts";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "manent-dialogs-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true })));
});

test("readOpenedPaths reads valid script formats and refuses unsupported types and oversized files", async () => {
  const dir = await makeTempDir();
  const fdx = join(dir, "pilot.fdx");
  const fountain = join(dir, "SCENE.FOUNTAIN");
  const ink = join(dir, "branch.ink");
  const docx = join(dir, "outline.docx");
  const refusedType = join(dir, "photo.png");
  const oversized = join(dir, "huge.fdx");
  const folderLike = join(dir, "folder.fdx");
  const missing = join(dir, "vanished.fdx");

  await Promise.all([
    writeFile(fdx, "INT. STUDIO - DAY\n"),
    writeFile(fountain, "FADE IN:\n"),
    writeFile(ink, "-> start\n"),
    writeFile(docx, "PK\x03\x04"),
    writeFile(refusedType, "not a script"),
    writeFile(oversized, ""),
    mkdir(folderLike),
  ]);
  await truncate(oversized, OPENED_FILE_LIMIT_BYTES + 1);

  const result = await readOpenedPaths([
    "",
    fdx,
    fountain,
    ink,
    docx,
    refusedType,
    oversized,
    folderLike,
    missing,
  ]);

  expect(result.files).toEqual([
    { name: "pilot.fdx", bytes: Buffer.from("INT. STUDIO - DAY\n").toBase64() },
    { name: "SCENE.FOUNTAIN", bytes: Buffer.from("FADE IN:\n").toBase64() },
    { name: "branch.ink", bytes: Buffer.from("-> start\n").toBase64() },
    { name: "outline.docx", bytes: Buffer.from("PK\x03\x04").toBase64() },
  ]);
  expect(result.refused).toEqual([
    { name: "photo.png", reason: "type" },
    { name: "huge.fdx", reason: "size" },
  ]);
});

test("readOpenedPaths caps opened files and refusals at 32 entries each", async () => {
  const dir = await makeTempDir();
  const validPaths: string[] = [];
  const invalidPaths: string[] = [];
  for (let i = 0; i < 35; i++) {
    const valid = join(dir, `script-${i}.fountain`);
    await writeFile(valid, `scene ${i}`);
    validPaths.push(valid);
    invalidPaths.push(join(dir, `notes-${i}.json`));
  }

  const result = await readOpenedPaths([...validPaths, ...invalidPaths]);

  expect(result.files).toHaveLength(32);
  expect(result.refused).toHaveLength(32);
  expect(result.files[0]?.name).toBe("script-0.fountain");
  expect(result.files[31]?.name).toBe("script-31.fountain");
  expect(result.refused[0]).toEqual({ name: "notes-0.json", reason: "type" });
  expect(result.refused[31]).toEqual({ name: "notes-31.json", reason: "type" });
});

test("chooseFiles and chooseDirectory delegate to the system dialog", async () => {
  const dir = await makeTempDir();
  const script = join(dir, "draft.fdx");
  await writeFile(script, "<FinalDraft/>");

  const dialogCalls: unknown[] = [];
  const fakeUtils: DialogUtils = {
    showMessageBox: async () => ({ response: 1 }),
    openExternal: () => {},
    openFileDialog: async (options) => {
      dialogCalls.push(options);
      if (options.canChooseDirectory) return [dir];
      return [script, join(dir, "bad.exe")];
    },
  };

  const chosen = await chooseFiles(fakeUtils);
  expect(chosen).toEqual({
    files: [
      { name: "draft.fdx", bytes: Buffer.from("<FinalDraft/>").toBase64() },
    ],
    refused: [{ name: "bad.exe", reason: "type" }],
  });

  expect(await chooseDirectory(fakeUtils)).toBe(dir);
  expect(
    await chooseDirectory({
      ...fakeUtils,
      openFileDialog: async () => [],
    }),
  ).toBeNull();
  expect(dialogCalls).toHaveLength(2);
});
