import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROJECT_RUNDOWN_SKELETON_KEY,
  PROJECT_SCRIPT_SKELETON_KEY,
  jsonMap,
  readEpisodes,
  readWorkspaceTemplates,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { buildSeed, createRng, seedDoc, seedProject } from "@manent/demo";
import type { SeedDriver } from "@manent/demo";
import {
  ENGINE_VERSION,
  NO_LOCKS,
  engineFor,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import { pickupLineRows } from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import type { VersionContentResponse } from "@manent/sync-protocol";
import { createSeedDriver } from "../src/seed/driver.ts";
import { createPageMeter } from "../src/seed/page-meter.ts";
import {
  SEED_CALLER,
  SEED_HOST,
  createSeedServer,
} from "../src/seed/server.ts";

async function withDoc<T>(
  driver: SeedDriver,
  docId: string,
  fn: (doc: CrdtDoc) => T,
): Promise<T> {
  const session = await driver.open("dana", docId);
  try {
    return fn(session.doc);
  } finally {
    await session.close();
  }
}

test("full foreground seed builds all Writers' room showcase variants, assets, chyrons, Pickup lines, templates, folders, and Trash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "manent-showcase-seed-"));
  const rng = createRng(4747);
  const seedAt = Date.UTC(2026, 10, 27, 18, 0, 0);
  const server = await createSeedServer({ dataDir: dir, seedAt, rng });
  try {
    const driver = createSeedDriver({
      target: server,
      random: () => rng.next(),
    });
    await buildSeed({
      phase: "foreground",
      driver,
      meter: createPageMeter(),
      seedAt,
      dataDir: dir,
    });
    await driver.writeEdits();

    // 1. Book (The Salt Almanac): inline image graphic with uploaded PNG asset readable via HTTP
    const bookAssetId = await withDoc(
      driver,
      seedDoc("medium/the-salt-almanac/manuscript").docId,
      (doc) => {
        const blocks = blocksOf(scriptBody(doc).materialize());
        const graphic = blocks.find((b) => b.attrs.type === "graphic");
        expect(graphic?.attrs.graphic?.kind).toBe("image");
        return graphic?.attrs.graphic?.assetId ?? null;
      },
    );
    expect(bookAssetId).toMatch(/^[0-9a-f]{64}$/);
    const bookProjectId = seedProject("medium/the-salt-almanac").projectId;
    const token = server.sessions.issue("leo");
    const assetRes = await server.server.fetch(
      new Request(
        `http://${SEED_HOST}/api/projects/${bookProjectId}/assets/${bookAssetId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      SEED_CALLER,
    );
    expect(assetRes?.status).toBe(200);
    expect(assetRes?.headers.get("content-type")).toBe("image/png");
    expect(assetRes?.headers.get("x-asset-width")).toBe("160");
    expect(assetRes?.headers.get("x-asset-height")).toBe("90");

    // 2. Animation (Tin Boat 101): Record draft + 3 post-record pickup lines + storyboard image graphic
    const tinBoatId = seedDoc("medium/tin-boat/101").docId;
    const versions = await driver.versions("dana", tinBoatId);
    const recordVersion = versions.find((v) => v.name === "Record draft");
    expect(recordVersion).toBeDefined();
    const tinBoatJson = await withDoc(driver, tinBoatId, (doc) =>
      scriptBody(doc).materialize(),
    );
    expect(
      blocksOf(tinBoatJson).some(
        (b) => b.attrs.type === "graphic" && b.attrs.graphic?.kind === "image",
      ),
    ).toBe(true);
    const recordContentRes = await server.server.fetch(
      new Request(
        `http://${SEED_HOST}/api/versions/content?docId=${tinBoatId}&versionId=${recordVersion!.id}`,
        {
          headers: {
            Authorization: `Bearer ${server.sessions.issue("dana")}`,
          },
        },
      ),
      SEED_CALLER,
    );
    expect(recordContentRes?.status).toBe(200);
    const recordBody =
      (await recordContentRes!.json()) as VersionContentResponse;
    const engine = engineFor(ENGINE_VERSION)!;
    const profile = profileFromSettings(
      engine,
      readLayoutSettings((key) =>
        key === "script.format" ? "animation" : undefined,
      ),
    )!;
    const pages = engine.paginate(
      engine.toLayoutBlocks(blocksOf(tinBoatJson)),
      profile,
      NO_LOCKS,
    );
    const pickups = pickupLineRows(pages, recordBody.content.blocks);
    expect(pickups.length).toBe(3);

    // 3. Multi-camera Series (Platform Two): 3 episodes on series index + 100 Early Pitch in Trash
    const epCount = await withDoc(
      driver,
      indexDocId("project", seedProject("medium/platform-two").projectId),
      (doc) => readEpisodes(doc).size,
    );
    expect(epCount).toBe(3);
    const trashRes = await server.server.fetch(
      new Request(`http://${SEED_HOST}/api/trash/list`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${server.sessions.issue("dana")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId: "medium" }),
      }),
      SEED_CALLER,
    );
    expect(trashRes?.status).toBe(200);
    const trashJson = (await trashRes!.json()) as {
      items: readonly { docId: string }[];
    };
    expect(
      trashJson.items.some(
        (item) =>
          item.docId === seedDoc("medium/platform-two/100-early-pitch").docId,
      ),
    ).toBe(true);

    // 4. Broadcast chyrons on Lannick One News story 07 & The Late Desk segment 4
    const newsKinds = await withDoc(
      driver,
      seedDoc("medium/lannick-one-news/stories/07").docId,
      (doc) =>
        blocksOf(scriptBody(doc).materialize())
          .filter((b) => b.attrs.type === "graphic")
          .map((b) => b.attrs.graphic?.kind)
          .toSorted(),
    );
    expect(newsKinds).toEqual(["full_screen", "lower_third", "ots"]);

    const hasShowLowerThird = await withDoc(
      driver,
      seedDoc("medium/the-late-desk/segments/4").docId,
      (doc) =>
        blocksOf(scriptBody(doc).materialize()).some(
          (b) =>
            b.attrs.type === "graphic" &&
            b.attrs.graphic?.kind === "lower_third",
        ),
    );
    expect(hasShowLowerThird).toBe(true);

    // 5. Reusable Show & News templates + nested folders in medium workspace index
    await withDoc(driver, indexDocId("workspace", "medium"), (doc) => {
      const templates = [...readWorkspaceTemplates(doc).values()];
      expect(templates.map((t) => t.name).toSorted()).toEqual([
        "Evening 18:30 News Bulletin",
        "Standard Late Show Segment",
      ]);
      const folderNames = Object.values(jsonMap(doc, "folders").entries())
        .map((entry) =>
          typeof entry === "object" && entry !== null && "name" in entry
            ? String((entry as { name: unknown }).name)
            : "",
        )
        .toSorted();
      expect(folderNames).toEqual([
        "Audio",
        "Books & Stage",
        "Broadcast",
        "Daily & Live",
        "Features",
        "Scripted",
        "Series",
      ]);
    });

    await withDoc(
      driver,
      indexDocId("project", seedProject("medium/lannick-one-news").projectId),
      (doc) => {
        expect(
          jsonMap(doc, "template").get(PROJECT_RUNDOWN_SKELETON_KEY),
        ).not.toBeNull();
      },
    );

    await withDoc(
      driver,
      indexDocId("project", seedProject("medium/the-late-desk").projectId),
      (doc) => {
        expect(
          jsonMap(doc, "template").get(PROJECT_SCRIPT_SKELETON_KEY),
        ).not.toBeNull();
        // Leave The Late Desk rundown default unset for the rundown-show-template Tour
        expect(
          jsonMap(doc, "template").get(PROJECT_RUNDOWN_SKELETON_KEY),
        ).toBeNull();
      },
    );
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 90_000);
