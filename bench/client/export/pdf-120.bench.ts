// Writing the PDF of a 120-page script, in Bun, from its pagination: no browser and no server.
import { join } from "node:path";
import { writePdf } from "@manent/formats";
import type { ScriptFontFiles } from "@manent/formats";
import { paginate, profileFor, toLayoutBlocks } from "@manent/pagination";
import type { FontFaceKey } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import { documentOfPages } from "../../corpus/documents.ts";
import { benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement, sampleMs } from "../../measure.ts";

/** PDFs a process writes, by mode. */
const WRITES = { quick: 1, standard: 10, full: 10 } as const;
/** The script font comes with the formats package, which embeds it; the benchmark declares no font of its own. */
const FONTS_FROM = join(import.meta.dir, "../../../packages/formats");

const readFace = (key: FontFaceKey): Promise<Uint8Array> =>
  Bun.file(
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      FONTS_FROM,
    ),
  ).bytes();

/** The script font's eight faces, as the PDF embeds them. */
async function readScriptFonts(): Promise<ScriptFontFiles> {
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

/**
 * `writePdf` of the pagination of the corpus's screenplay of 120 pages (seed 1), WRITES times a process: `pdf_ms`
 * each write through sampleMs, `pdf_bytes` each file's size, and `input_blocks`.
 */
const scenario: Scenario = {
  id: "export.pdf-120",
  workload: "W1",
  processes: 5,
  async run() {
    const d = documentOfPages({
      format: "screenplay",
      pages: 120,
      seed: 1,
      sections: "even",
    });
    const profile = profileFor("screenplay");
    if (profile === null) throw new RangeError("a screenplay has no pages");
    const pagination = paginate(toLayoutBlocks(blocksOf(d.doc)), profile);
    const fonts = await readScriptFonts();
    const times: number[] = [];
    const sizes: number[] = [];
    for (let n = 0; n < WRITES[benchMode()]; n++) {
      let bytes = 0;
      times.push(
        await sampleMs(async () => {
          bytes = (await writePdf(pagination, { fonts })).byteLength;
        }),
      );
      sizes.push(bytes);
    }
    return [
      measurement("pdf_ms", "ms", times),
      measurement("pdf_bytes", "bytes", sizes),
      inputBlocks(d.blocks),
    ];
  },
};

export default scenario;
