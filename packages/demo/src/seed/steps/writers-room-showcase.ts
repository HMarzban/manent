// Five foreground Writers' room showcase projects covering Book (Manuscript), Stage Play,
// Multi-camera Series (with Board and recoverable Trash), Animation Series (with Record draft
// for Pickup lines CSV and inline storyboard graphic), and Podcast (read-rate & bracket timing).
import {
  ORIGIN_TITLE_PAGE,
  bookMatter,
  scriptBody,
  titlePage,
} from "@manent/crdt";
import { blockText, blocksOf, textAnchorAt } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock } from "../../content/markup.ts";
import {
  HARBOUR_TAPE_EP1,
  HARBOUR_TAPE_EP1_PRODUCER_NOTE,
  HARBOUR_TAPE_EP2,
  PIER_FOUR_FRONT,
  PIER_FOUR_NAMES,
  PIER_FOUR_POLISHED_LINE,
  PIER_FOUR_REHEARSAL,
  SALT_ALMANAC_FIRST_DRAFT,
  SALT_ALMANAC_NAMES,
  SALT_ALMANAC_REVISED_OPENING,
} from "../../content/medium/writers-room-showcase.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import { makeTidePlatePng } from "../png.ts";
import type { SeedContext, SeedEntry, SeedStep } from "../seed.ts";
import { createProject, projectEntry, toBlockJSON } from "../story.ts";
import {
  graphicBlock,
  replaceTextInSession,
  writeInitial,
} from "./writers-room-showcase-helpers.ts";
import {
  PLATFORM_TWO,
  TIN_BOAT,
  seedPlatformTwo,
  seedTinBoat,
} from "./writers-room-showcase-series.ts";

const SALT_ALMANAC = "medium/the-salt-almanac";
const PIER_FOUR = "medium/pier-four-at-low-water";
const HARBOUR_TAPE = "medium/harbour-tape";

const PAGE_BREAK: SeedBlock = {
  element: "page_break",
  text: "",
  marks: [],
  kind: null,
};

async function seedSaltAlmanac(context: SeedContext): Promise<void> {
  const { driver, ids, time } = context;
  if (driver === null) return;
  const docKey = `${SALT_ALMANAC}/manuscript`;
  const { projectId } = seedProject(SALT_ALMANAC);
  const { docId } = seedDoc(docKey);
  await driver.setTime(time.at("D−18 10:00"));
  await createProject(driver, {
    userId: "dana",
    projectKey: SALT_ALMANAC,
    at: time.at("D−18 10:00"),
  });
  const allBlocks = parseSeedText(SALT_ALMANAC_FIRST_DRAFT).blocks;
  const ch2 = allBlocks.findIndex(
    (b) => b.element === "chapter" && b.text.startsWith("2."),
  );
  const ch1First = toBlockJSON(allBlocks[0]!, ids());
  const ch1WithTarget: BlockJSON = {
    ...ch1First,
    attrs: { ...ch1First.attrs, targetWords: 500 },
  };
  const part1 = await writeInitial(context, {
    userId: "dana",
    docKey,
    at: "D−18 10:30",
    blocks: allBlocks.slice(1, ch2),
    prepend: [ch1WithTarget],
  });
  const part2Blocks = allBlocks.slice(ch2);
  const part2Ids = part2Blocks.map(() => ids());
  const ch2FirstBody = part2Blocks.findIndex((b) => b.element === "body");
  const ch2KerrBody = part2Blocks.findIndex((b) =>
    b.text.includes("Captain Mara Kerr"),
  );
  await driver.setTime(time.at("D−15 14:20"));
  const samSession = await driver.open("sam", docId);
  try {
    await samSession.change((doc) => {
      titlePage(doc).set("title", "The Salt Almanac", ORIGIN_TITLE_PAGE);
      titlePage(doc).set(
        "authors",
        "Dana Reyes & Sam Okafor",
        ORIGIN_TITLE_PAGE,
      );
      const matter = bookMatter(doc);
      matter.set(
        "subtitle",
        "Notes on Tides, Lamps and Winter Crossings",
        ORIGIN_TITLE_PAGE,
      );
      matter.set(
        "copyright",
        "Copyright © 2026 Writers' Room Press. All rights reserved.",
        ORIGIN_TITLE_PAGE,
      );
      matter.set("isbn", "978-0-900123-45-6", ORIGIN_TITLE_PAGE);
      matter.set(
        "dedication",
        "For every watchman who read the steps before the clock.",
        ORIGIN_TITLE_PAGE,
      );
      matter.set(
        "acknowledgments",
        "Thanks to the Lannick Harbour Archive and the boatyard at Ardle Quay.",
        ORIGIN_TITLE_PAGE,
      );
      matter.set(
        "aboutAuthor",
        "Dana Reyes and Sam Okafor write coastal non-fiction in Lannick.",
        ORIGIN_TITLE_PAGE,
      );
      scriptBody(doc).write((w) => {
        w.insertBlocks(
          part1.ids.at(-1)!,
          part2Blocks.map((b, i) => {
            const json = toBlockJSON(b, part2Ids[i]!);
            if (i === ch2FirstBody) {
              return {
                ...json,
                attrs: { ...json.attrs, firstLine: "drop_cap" as const },
              };
            }
            if (i === ch2KerrBody) {
              return {
                ...json,
                content: [
                  {
                    type: "text" as const,
                    text: b.text,
                    marks: [
                      {
                        type: "footnote" as const,
                        attrs: {
                          id: "fn-salt-kerr",
                          text: "Harbour Pilots' Ledger, Vol. IV, Ardle Quay.",
                        },
                      },
                    ],
                  },
                ],
              };
            }
            return json;
          }),
        );
      });
    });
  } finally {
    await samSession.close();
  }
  if (driver.capabilities.has("history")) {
    await driver.setTime(time.at("D−14 17:00"));
    await driver.nameDraft("dana", docId, "First full draft");
  }
  await driver.setTime(time.at("D−4 11:15"));
  const uploaded = await driver.uploadAsset(
    "dana",
    { projectId, workspaceId: "medium" },
    makeTidePlatePng(),
  );
  const firstBodyIndex = part1.blocks.findIndex((b) => b.element === "body");
  const secondBodyIndex = part1.blocks.findIndex(
    (b, i) => i > firstBodyIndex && b.element === "body",
  );
  const plateBlock = graphicBlock(
    ids(),
    {
      kind: "image",
      assetId: uploaded.assetId,
      heightLines: 8,
      label: "Plate 1",
      alt: "Archival spring-tide and neap-tide curves at Gull Point",
      aspectWidth: uploaded.width,
      aspectHeight: uploaded.height,
    },
    "Fig. 1 — Autumn spring-tide curve along Ardle Quay granite steps.",
  );
  await replaceTextInSession(context, {
    userId: "dana",
    docKey,
    at: "D−4 11:15",
    replacements: [
      {
        blockId: part1.ids[firstBodyIndex]!,
        from: part1.blocks[firstBodyIndex]!.text,
        to: SALT_ALMANAC_REVISED_OPENING,
      },
    ],
    insertAfter: {
      afterId: part1.ids[secondBodyIndex]!,
      blocks: [plateBlock],
    },
  });
  if (driver.series !== null) {
    await driver.setTime(time.at("D−4 11:30"));
    await driver.series.setNames(
      "dana",
      { projectId, workspaceId: "medium" },
      SALT_ALMANAC_NAMES,
    );
  }
  if (driver.comments !== null) {
    await driver.setTime(time.at("D−3 14:10"));
    const anchor = textAnchorAt(
      { id: part1.ids[firstBodyIndex]!, text: SALT_ALMANAC_REVISED_OPENING },
      0,
      36,
    );
    await driver.comments.startThread("leo", docId, {
      anchor,
      roundId: null,
      body: "Strong opening contrast between the exchange dial and the tide line — keep the 1911 watch-book quote right after the plate.",
    });
  }
  if (driver.writersMaterial !== null) {
    await driver.setTime(time.at("D−2 15:40"));
    const ch3Index = part2Blocks.findIndex(
      (b) => b.element === "chapter" && b.text.startsWith("3."),
    );
    const ch3Anchor = textAnchorAt(
      { id: part2Ids[ch3Index]!, text: part2Blocks[ch3Index]!.text },
      0,
      part2Blocks[ch3Index]!.text.length,
    );
    await driver.writersMaterial.addNotes("sam", docId, [
      {
        anchor: ch3Anchor,
        text: "Check with the harbour archives whether the Fresnel lamp diagram belongs here or in Chapter 4.",
        writerName: "Sam Okafor",
      },
    ]);
  }
}

async function seedPierFour(context: SeedContext): Promise<void> {
  const { driver, time } = context;
  if (driver === null) return;
  const docKey = `${PIER_FOUR}/script`;
  const { projectId } = seedProject(PIER_FOUR);
  const { docId } = seedDoc(docKey);
  await driver.setTime(time.at("D−14 11:00"));
  await createProject(driver, {
    userId: "sam",
    projectKey: PIER_FOUR,
    at: time.at("D−14 11:00"),
  });
  const frontPages = PIER_FOUR_FRONT.trim()
    .split("\n\n")
    .flatMap((page) => [...parseSeedText(page).blocks, PAGE_BREAK]);
  const playBlocks = parseSeedText(PIER_FOUR_REHEARSAL).blocks;
  const written = await writeInitial(context, {
    userId: "sam",
    docKey,
    at: "D−14 11:30",
    blocks: [...frontPages, ...playBlocks],
  });
  if (driver.capabilities.has("history")) {
    await driver.setTime(time.at("D−10 16:00"));
    await driver.nameDraft("sam", docId, "Rehearsal script");
  }
  const noraOriginal = "It is running tomorrow morning at seven-fifteen.";
  const noraIdx = written.blocks.findIndex((b) => b.text === noraOriginal);
  await replaceTextInSession(context, {
    userId: "dana",
    docKey,
    at: "D−3 15:20",
    replacements: [
      {
        blockId: written.ids[noraIdx]!,
        from: noraOriginal,
        to: PIER_FOUR_POLISHED_LINE,
      },
    ],
  });
  if (driver.writersMaterial !== null) {
    await driver.setTime(time.at("D−3 15:35"));
    await driver.writersMaterial.addAlternate("sam", docId, {
      blockId: written.ids[noraIdx]!,
      text: "It is running tomorrow morning at seven-fifteen, provided the wind remembers its manners.",
      pitched: true,
    });
  }
  if (driver.comments !== null) {
    await driver.setTime(time.at("D−2 11:20"));
    const anchor = textAnchorAt(
      { id: written.ids[noraIdx]!, text: PIER_FOUR_POLISHED_LINE },
      0,
      36,
    );
    await driver.comments.startThread("leo", docId, {
      anchor,
      roundId: null,
      body: "Love the dry timing on Nora's first reply — plays beautifully in a quiet house.",
    });
  }
  if (driver.series !== null) {
    await driver.setTime(time.at("D−2 11:30"));
    await driver.series.setNames(
      "dana",
      { projectId, workspaceId: "medium" },
      PIER_FOUR_NAMES,
    );
  }
}

async function seedHarbourTape(context: SeedContext): Promise<void> {
  const { driver, ids, time } = context;
  if (driver === null) return;
  const ep1Key = `${HARBOUR_TAPE}/ep1`;
  const ep2Key = `${HARBOUR_TAPE}/ep2`;
  await driver.setTime(time.at("D−9 09:00"));
  await createProject(driver, {
    userId: "ana",
    projectKey: HARBOUR_TAPE,
    at: time.at("D−9 09:00"),
  });
  const producerNote: BlockJSON = {
    type: "block",
    attrs: { id: ids(), type: "general", noTiming: true },
    content: [{ type: "text", text: HARBOUR_TAPE_EP1_PRODUCER_NOTE }],
  };
  await writeInitial(context, {
    userId: "ana",
    docKey: ep1Key,
    at: "D−9 09:30",
    blocks: parseSeedText(HARBOUR_TAPE_EP1).blocks,
    prepend: [producerNote],
  });
  if (driver.capabilities.has("history")) {
    await driver.setTime(time.at("D−7 11:00"));
    await driver.nameDraft("ana", seedDoc(ep1Key).docId, "Studio record cut");
  }
  await writeInitial(context, {
    userId: "ana",
    docKey: ep2Key,
    at: "D−3 10:15",
    blocks: parseSeedText(HARBOUR_TAPE_EP2).blocks,
  });
  if (driver.comments !== null) {
    const ep2DocId = seedDoc(ep2Key).docId;
    const session = await driver.open("sam", ep2DocId);
    let bracketBlock: { id: string; text: string } | null = null;
    try {
      const blocks = blocksOf(scriptBody(session.doc).materialize());
      const found = blocks.find((b) => blockText(b).includes("T=0:8"));
      if (found?.attrs.id !== null && found?.attrs.id !== undefined)
        bracketBlock = { id: found.attrs.id, text: blockText(found) };
    } finally {
      await session.close();
    }
    if (bracketBlock !== null) {
      await driver.setTime(time.at("D−2 16:20"));
      await driver.comments.startThread("sam", ep2DocId, {
        anchor: textAnchorAt(bracketBlock, 0, bracketBlock.text.length),
        roundId: null,
        body: "Checks flagged T=0:8 here — needs two digits for seconds (T=0:08) so Running time counts it.",
      });
    }
  }
}

const SHOWCASE_PROJECTS = [
  SALT_ALMANAC,
  PIER_FOUR,
  PLATFORM_TWO,
  TIN_BOAT,
  HARBOUR_TAPE,
] as const;

export const WRITERS_ROOM_SHOWCASE: SeedStep = {
  id: "writers-room-showcase",
  workspace: "medium",
  background: false,
  async run(context): Promise<SeedEntry[]> {
    const entries = SHOWCASE_PROJECTS.map(projectEntry);
    if (context.driver === null) return entries;
    await seedSaltAlmanac(context);
    await seedPierFour(context);
    await seedPlatformTwo(context);
    await seedTinBoat(context);
    await seedHarbourTape(context);
    return entries;
  },
};
