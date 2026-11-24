// Harbour Lights room state: 201–204 sends, rounds and comments; 205 assignments, pitches and Sam's private copy.
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf, isBlockType, textAnchorAt } from "@manent/schema";
import type { FlatBlock, TextAnchor } from "@manent/schema";
import type { SeedBlock } from "../../content/markup.ts";
import {
  SLACK_WATER_DANA_SCENE_7_SPEECH,
  SLACK_WATER_PITCHES,
  SLACK_WATER_PRIVATE_SCENES,
  slackWaterProgress,
} from "../../content/medium/harbour-lights-room.ts";
import type {
  EpisodeTarget,
  EpisodeThread,
} from "../../content/medium/harbour-lights-room.ts";
import { HARBOUR_LIGHTS_SEND_PLANS } from "../../content/medium/harbour-lights-sends.ts";
import type {
  EpisodeSendPlan,
  VersionLookup,
} from "../../content/medium/harbour-lights-sends.ts";
import type { PageMeter } from "../../generate/fit.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedComments } from "../capabilities/comments.ts";
import type { SeedPrivateCopies } from "../capabilities/private-copies.ts";
import type { SeedSharing } from "../capabilities/sharing.ts";
import type { SeedWritersMaterial } from "../capabilities/writers-material.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver, SeedProduction } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import type { SeedTime } from "../time.ts";

const PROJECT_KEY = "medium/harbour-lights";
const ANCHOR_SPAN_CHARS = 48;

interface Drivers {
  readonly driver: SeedDriver;
  readonly comments: SeedComments;
  readonly material: SeedWritersMaterial;
  readonly sharing: SeedSharing;
  readonly privateCopies: SeedPrivateCopies;
  readonly production: SeedProduction;
  readonly meter: PageMeter;
  readonly time: SeedTime;
}

interface ScriptPages {
  readonly blocks: readonly FlatBlock[];
  readonly pages: readonly { label: string; blockIndex: number }[];
}

function requireDrivers(context: SeedContext): Drivers {
  const { driver, meter, time } = context;
  if (driver === null || meter === null)
    throw new RangeError("harbour-lights-room requires a driver and meter");
  const { comments, writersMaterial: material, sharing } = driver;
  const { privateCopies, production } = driver;
  if (!comments || !material || !sharing || !privateCopies || !production)
    throw new SeedDriverError(
      "unavailable",
      "required seed capabilities are off",
    );
  return {
    driver,
    comments,
    material,
    sharing,
    privateCopies,
    production,
    meter,
    time,
  };
}

const epDocId = (suffix: string): string =>
  seedDoc(`${PROJECT_KEY}/${suffix}`).docId;

const blockIdOf = (block: FlatBlock): string => {
  if (block.attrs.id === null) throw new RangeError("seeded block has no id");
  return block.attrs.id;
};

const toSeedBlocks = (blocks: readonly FlatBlock[]): SeedBlock[] =>
  blocks.map((block) => ({
    element: isBlockType(block.attrs.type) ? block.attrs.type : "general",
    text: blockText(block),
    marks: [],
    kind: block.attrs.kind,
  }));

async function readScriptPages(
  d: Drivers,
  docId: string,
): Promise<ScriptPages> {
  const session = await d.driver.open("dana", docId);
  let blocks: readonly FlatBlock[];
  try {
    blocks = blocksOf(scriptBody(session.doc).materialize());
  } finally {
    await session.close();
  }
  const pages = await d.meter.pages(toSeedBlocks(blocks), {
    format: "screenplay",
    settings: {},
    anchors: null,
  });
  return { blocks, pages };
}

function anchorOfTarget(
  script: ScriptPages,
  target: EpisodeTarget,
): TextAnchor | null {
  if (target.kind === "script") return null;
  if (target.kind === "quote") {
    for (const block of script.blocks) {
      const text = blockText(block);
      const start = text.indexOf(target.quote);
      if (start >= 0)
        return textAnchorAt(
          { id: blockIdOf(block), text },
          start,
          start + target.quote.length,
        );
    }
    throw new RangeError(`quote not found: ${target.quote}`);
  }
  const clamped = Math.max(1, Math.min(target.page, script.pages.length));
  const start = script.pages[clamped - 1]?.blockIndex ?? 0;
  const end = script.pages[clamped]?.blockIndex ?? script.blocks.length;
  const chosen =
    script.blocks
      .slice(start, end)
      .find((b) => blockText(b).trim().length > 0) ??
    script.blocks[Math.min(start, script.blocks.length - 1)];
  if (chosen === undefined)
    throw new RangeError(`no block on page ${target.page}`);
  const text = blockText(chosen);
  return textAnchorAt(
    { id: blockIdOf(chosen), text },
    0,
    Math.min(text.length, ANCHOR_SPAN_CHARS),
  );
}

async function resolveVersion(
  d: Drivers,
  docId: string,
  lookup: VersionLookup,
): Promise<string> {
  if (lookup.kind === "production") {
    const prod = await d.production.state("priya", docId);
    const id = prod.sets.find(
      (s) => s.ordinal === lookup.ordinal,
    )?.issuedVersionId;
    if (id === null || id === undefined)
      throw new RangeError(`${docId} has no issued set ${lookup.ordinal}`);
    return id;
  }
  const found = (await d.driver.versions("dana", docId)).find(
    (v) => v.name === lookup.name,
  );
  if (found === undefined)
    throw new RangeError(`${docId} has no version named ${lookup.name}`);
  return found.id;
}

async function seedThreads(
  d: Drivers,
  docId: string,
  script: ScriptPages,
  roundId: string | null,
  threads: readonly EpisodeThread[],
): Promise<void> {
  for (const spec of threads) {
    await d.driver.setTime(d.time.at(spec.at));
    const { threadId } = await d.comments.startThread(
      spec.authorUserId,
      docId,
      {
        anchor: anchorOfTarget(script, spec.target),
        roundId,
        body: spec.body,
      },
    );
    for (const reply of spec.replies) {
      await d.driver.setTime(d.time.at(reply.at));
      await d.comments.reply(reply.authorUserId, docId, {
        threadId,
        body: reply.body,
      });
    }
    if (spec.resolved !== null) {
      await d.driver.setTime(d.time.at(spec.resolved.at));
      await d.comments.resolve(spec.resolved.byUserId, docId, {
        threadId,
        outcome: spec.resolved.outcome,
        reason: spec.resolved.reason,
      });
    }
  }
}

async function runSendPlan(
  d: Drivers,
  plan: EpisodeSendPlan,
  cache: Map<string, ScriptPages>,
): Promise<void> {
  const docId = epDocId(plan.episode);
  const versionId = await resolveVersion(d, docId, plan.version);
  const againstVersionId =
    plan.against === null ? null : await resolveVersion(d, docId, plan.against);
  await d.driver.setTime(d.time.at(plan.at));
  const sent = await d.sharing.sendVersion(plan.userId, {
    docId,
    versionId,
    name: plan.name,
    what: plan.what,
    againstVersionId,
    files: plan.files,
    groupIds: plan.groupIds,
    recipientUserIds: plan.extraUserIds,
    watermark: false,
    link: plan.withLink ? { signIn: true, expiresInMs: null } : null,
  });
  if (plan.leoOpenedAt !== null && sent.recipientToken !== null) {
    await d.driver.setTime(d.time.at(plan.leoOpenedAt));
    await d.sharing.openDraftLink("leo", sent.recipientToken);
  }
  if (plan.roundThreads.length === 0 && plan.workingThreads.length === 0)
    return;
  let script = cache.get(docId);
  if (script === undefined) {
    script = await readScriptPages(d, docId);
    cache.set(docId, script);
  }
  if (plan.roundName !== null && plan.roundThreads.length > 0) {
    const round = (await d.comments.rounds("dana", docId)).find(
      (r) => r.versionId === versionId && r.name === plan.roundName,
    );
    if (round === undefined)
      throw new RangeError(`${docId} has no round ${plan.roundName}`);
    await seedThreads(d, docId, script, round.roundId, plan.roundThreads);
  }
  await seedThreads(d, docId, script, null, plan.workingThreads);
}

function sceneSlice(
  blocks: readonly FlatBlock[],
  sceneNumber: number,
): readonly FlatBlock[] {
  let seen = 0;
  const start = blocks.findIndex(
    (b) => b.attrs.type === "scene_heading" && ++seen === sceneNumber,
  );
  if (start === -1) throw new RangeError(`script has no scene ${sceneNumber}`);
  const end = blocks.findIndex(
    (b, i) => i > start && b.attrs.type === "scene_heading",
  );
  return blocks.slice(start, end === -1 ? blocks.length : end);
}

async function rewriteTextBlocks(
  d: Drivers,
  userId: string,
  docId: string,
  at: string,
  edits: readonly { blockId: string; oldText: string; newText: string }[],
): Promise<void> {
  await d.driver.setTime(d.time.at(at));
  const session = await d.driver.open(userId, docId);
  try {
    await session.change((doc) =>
      scriptBody(doc).write((writer) => {
        for (const edit of edits) {
          writer.deleteText(edit.blockId, 0, edit.oldText.length);
          writer.insertText(edit.blockId, 0, edit.newText);
        }
      }),
    );
  } finally {
    await session.close();
  }
}

async function seedSlackWater(d: Drivers): Promise<void> {
  const doc205 = epDocId("205");
  const { blocks } = await readScriptPages(d, doc205);
  const headings = blocks.filter((b) => b.attrs.type === "scene_heading");
  if (headings.length !== 22)
    throw new RangeError(`expected 22 scenes in 205, got ${headings.length}`);

  await d.driver.setTime(d.time.at("D−12 10:00"));
  await d.material.setSceneAssignments(
    "dana",
    doc205,
    headings.map((h, i) => ({
      headingId: blockIdOf(h),
      writerUserId: i + 1 <= 14 ? "sam" : "dana",
      progress: slackWaterProgress(i + 1),
    })),
  );

  const scene6 = sceneSlice(blocks, 6);
  const idaIdx = scene6.findIndex(
    (b, i) =>
      b.attrs.type === "character" &&
      blockText(b).trim() === "IDA" &&
      scene6[i + 1]?.attrs.type === "dialogue",
  );
  const idaSpeech =
    (idaIdx >= 0 ? scene6[idaIdx + 1] : undefined) ??
    scene6.find((b) => b.attrs.type === "dialogue");
  if (idaSpeech === undefined)
    throw new RangeError("205 scene 6 has no dialogue block");
  for (const pitch of SLACK_WATER_PITCHES) {
    await d.driver.setTime(d.time.at(pitch.at));
    await d.material.addAlternate(pitch.authorUserId, doc205, {
      blockId: blockIdOf(idaSpeech),
      text: pitch.text,
      pitched: true,
    });
  }

  // Sam edits 6 scenes privately (including scene 7's speech); Dana edits that same scene 7 speech in the room.
  await d.driver.setTime(d.time.at("D−1 14:00"));
  const { privateDocId } = await d.privateCopies.create("sam", doc205);
  const privateEdits = SLACK_WATER_PRIVATE_SCENES.map((edit) => {
    const scene = sceneSlice(blocks, edit.scene);
    const target =
      (edit.scene === 7
        ? scene.find((b) => b.attrs.type === "dialogue")
        : scene.find(
            (b) => b.attrs.type === "action" || b.attrs.type === "dialogue",
          )) ?? scene.find((b) => b.attrs.type !== "scene_heading");
    if (target === undefined)
      throw new RangeError(`205 scene ${edit.scene} has no editable block`);
    return {
      scene: edit.scene,
      blockId: blockIdOf(target),
      oldText: blockText(target),
      newText: edit.samText,
    };
  });
  await rewriteTextBlocks(d, "sam", privateDocId, "D−1 16:30", privateEdits);
  await d.privateCopies.setPosition("sam", doc205, "private");
  const scene7 = privateEdits.find((edit) => edit.scene === 7)!;
  await rewriteTextBlocks(d, "dana", doc205, "N−2:30", [
    {
      blockId: scene7.blockId,
      oldText: scene7.oldText,
      newText: SLACK_WATER_DANA_SCENE_7_SPEECH,
    },
  ]);
}

export const HARBOUR_LIGHTS_ROOM: SeedStep = {
  id: "harbour-lights-room",
  workspace: "medium",
  background: false,
  async run(context) {
    if (context.driver === null) return [];
    const d = requireDrivers(context);
    const cache = new Map<string, ScriptPages>();
    for (const plan of HARBOUR_LIGHTS_SEND_PLANS)
      await runSendPlan(d, plan, cache);
    await seedSlackWater(d);
    return [];
  },
};
