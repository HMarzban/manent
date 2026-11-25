// The Tour's desktop-files scenario: open and drop Fountain, FDX, PDF and Ink files generated at runtime in mkdtemp.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFdx, writeFountain, writePdf } from "@manent/formats";
import type { ScriptFontFiles, ScriptForExport } from "@manent/formats";
import { paginate, profileFor } from "@manent/pagination";
import type { FontFaceKey, LayoutBlock } from "@manent/pagination";
import { randomBlockId } from "@manent/schema";
import type { BlockJSON, BlockType } from "@manent/schema";
import { expect, test } from "@playwright/test";
import { dropFiles, openedScript } from "../formats/support.ts";
import { labelOf } from "../support/interface.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

test.describe.configure({ timeout: 180_000 });

function blockJson(type: BlockType, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id: randomBlockId(), type },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

function layoutBlock(type: BlockType, text: string): LayoutBlock {
  return {
    id: randomBlockId(),
    type,
    kind: null,
    text,
    styles: null,
    dual: null,
    num: null,
    align: null,
    indent: null,
    width: null,
    spaceBefore: null,
    noContd: false,
  };
}

function sampleScript(title: string): ScriptForExport {
  return {
    title,
    format: "screenplay",
    blocks: [
      blockJson("scene_heading", "INT. HARBOUR OFFICE - MORNING"),
      blockJson("action", "Rain taps the glass above the timetable board."),
      blockJson("character", "SAM"),
      blockJson("dialogue", "First boat leaves on the hour."),
    ],
    notes: [],
    record: null,
    production: null,
  };
}

async function readFace(key: FontFaceKey): Promise<Uint8Array> {
  return new Uint8Array(
    await readFile(
      Bun.resolveSync(
        `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
        import.meta.dir,
      ),
    ),
  );
}

async function loadFonts(): Promise<ScriptFontFiles> {
  return {
    "latin-400-normal": await readFace("latin-400-normal"),
    "latin-400-italic": await readFace("latin-400-italic"),
    "latin-700-normal": await readFace("latin-700-normal"),
    "latin-700-italic": await readFace("latin-700-italic"),
    "latin-ext-400-normal": await readFace("latin-ext-400-normal"),
    "latin-ext-400-italic": await readFace("latin-ext-400-italic"),
    "latin-ext-700-normal": await readFace("latin-ext-700-normal"),
    "latin-ext-700-italic": await readFace("latin-ext-700-italic"),
  };
}

/** Extracts the 71-line, 5-knot Ink source of The Keeper's Logbook from the demo seed content. */
async function keepersLogbookInk(): Promise<string> {
  const sourcePath = join(
    import.meta.dirname,
    "..",
    "..",
    "packages",
    "demo",
    "src",
    "content",
    "medium",
    "game-samples.ts",
  );
  const raw = await readFile(sourcePath, "utf8");
  const marker = "export const KEEPERS_LOGBOOK = `";
  const start = raw.indexOf(marker);
  if (start < 0) throw new Error("KEEPERS_LOGBOOK source not found");
  const bodyStart = start + marker.length;
  const end = raw.indexOf("`;", bodyStart);
  if (end < 0) throw new Error("KEEPERS_LOGBOOK closing tick not found");
  const lines = raw
    .slice(bodyStart, end)
    .split("\n")
    .filter((line) => line.startsWith("ink_line"))
    .map((line) => (line === "ink_line" ? "" : line.slice("ink_line ".length)));
  return lines.join("\n");
}

async function generateTempFiles(dir: string): Promise<{
  fountain: string;
  fdx: string;
  pdf: string;
  ink: string;
}> {
  const fountain = join(dir, "Pigeon Post.fountain");
  await writeFile(fountain, writeFountain(sampleScript("Pigeon Post")).text);

  const fdx = join(dir, "Low Tide Blue.fdx");
  await writeFile(fdx, writeFdx(sampleScript("Low Tide Blue")).text);

  const pdf = join(dir, "Every Key But One first draft.pdf");
  const pagination = paginate(
    [
      layoutBlock("scene_heading", "EXT. PELLSAND FRONT - MORNING"),
      layoutBlock("character", "MIRA"),
      layoutBlock(
        "dialogue",
        "Play the octave and keep your foot off the pedal.",
      ),
    ],
    profileFor("screenplay")!,
  );
  const pdfBytes = await writePdf(pagination, {
    fonts: await loadFonts(),
    title: "Every Key But One first draft",
  });
  await writeFile(pdf, pdfBytes);

  const ink = join(dir, "The Keeper's Logbook.ink");
  await writeFile(ink, await keepersLogbookInk());

  return { fountain, fdx, pdf, ink };
}

tourScenario("desktop-files", async ({ page, scenario, step }) => {
  const dir = await mkdtemp(join(tmpdir(), "manent-desktop-files-"));
  try {
    const files = await generateTempFiles(dir);

    await selectTourStep(page, scenario.promise, 0);
    const importBtn = page
      .getByRole("button", { name: labelOf("file.import") })
      .first();
    await expect(importBtn).toBeVisible();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      importBtn.click(),
    ]);
    await chooser.setFiles(files.fountain);
    const firstDoc = await openedScript(page);
    await expect(page.locator("[data-tour='message_slot']")).toContainText(
      "Imported 'Pigeon Post'",
    );

    await dropFiles(page, [
      {
        name: "Low Tide Blue.fdx",
        bytes: new Uint8Array(await readFile(files.fdx)),
      },
    ]);
    const secondDoc = await openedScript(page, firstDoc);
    const slot1 = await step(1);
    await expect(slot1).toContainText("Imported 'Low Tide Blue'", {
      timeout: 40_000,
    });

    await dropFiles(page, [
      {
        name: "Every Key But One first draft.pdf",
        bytes: new Uint8Array(await readFile(files.pdf)),
      },
    ]);
    const thirdDoc = await openedScript(page, secondDoc);
    const slot2 = await step(2);
    await expect(slot2).toContainText("Imported 'Every Key But One", {
      timeout: 40_000,
    });

    await dropFiles(page, [
      {
        name: "The Keeper's Logbook.ink",
        bytes: new Uint8Array(await readFile(files.ink)),
      },
    ]);
    await openedScript(page, thirdDoc);
    const slot3 = await step(3);
    await expect(slot3).toContainText(
      "Imported 'The Keeper's Logbook': 71 lines, 5 knots.",
      { timeout: 40_000 },
    );
    await expectEvidence([page], scenario);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
