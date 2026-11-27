import { describe, expect, test } from "bun:test";
import type { BlockJSON } from "../src/index.ts";
import {
  listGameScenes,
  replayGameScript,
  sceneIdForBlock,
} from "../src/index.ts";

function b(id: string, type: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

// Scene 4 of Twelve on Foot (Fog Bell) plus a follow-up Scene 5 gated on finn_found.
const FOG_BELL_SAMPLE: readonly BlockJSON[] = [
  b("s4", "scene_heading", "INT. CAR DECK - NIGHT"),
  b("e1", "engine", "LOAD car_deck_fog · PLAYER cal · INPUT walk_only"),
  b("set0", "general", "#set weather=fog"),
  b("cam1", "camera", "LOW AND SLOW DOWN THE ROW OF CARS."),
  b("act1", "action", "Engine noise, close and enormous."),
  b("ch1", "character", "PIKE"),
  b("d1", "dialogue", "You counted them aboard?"),
  b("em1", "emote", "PIKE: FLAT · CAL: STUNG"),
  b("c1", "general", "* [Check the van]"),
  b("act2", "action", "Cal crosses to the van and tries the rear door."),
  b("c1a", "general", "** [Look through the glass]"),
  b("ch2", "character", "CAL"),
  b("p2", "parenthetical", "(under his breath)"),
  b("d2", "dialogue", "Twelve on foot."),
  b("set1", "general", "#set finn_found=true"),
  b("c1b", "general", "** [Knock on the door]"),
  b("ch3", "character", "CAL"),
  b("d3", "dialogue", "Ferry's full, whoever you are."),
  b("act3", "action", "Two knocks back from inside the van."),
  b("set2", "general", "#set finn_found=true"),
  b("set3", "general", "#set finn_trust=1"),
  b("c2", "general", "* [Leave it for Pike]"),
  b("ch4", "character", "CAL"),
  b("d4", "dialogue", "There's a light on in that van."),
  b("ch5", "character", "PIKE"),
  b("d5", "dialogue", "There's a light on in your head."),
  b("g1", "general", "-"),
  b("act4", "action", "Above them the ferry sounds her horn."),
  b("e2", "engine", "SFX foghorn_long · DUCK ambient 6 dB for 3 s"),
  b("cond1", "general", "{finn_trust >= 1}"),
  b("ch6", "character", "FINN (O.S.)"),
  b("p6", "parenthetical", "(a whisper, from inside the van)"),
  b("d6", "dialogue", "Don't tell her."),
  b("em2", "emote", "CAL: DECIDES"),
  b("ch7", "character", "CAL"),
  b("d7", "dialogue", "Tell who?"),
  b("s5", "scene_heading", "INT. WHEELHOUSE - LATER"),
  b("ch8", "character", "CAL"),
  b("d8", "dialogue", "No. Just ours, and the water, #sfx footsteps_metal."),
  b("cond2", "general", "{finn_found}"),
  b("ch9", "character", "CAL"),
  b("d9", "dialogue", "There's a boy in the bread van."),
];

describe("Game Script playthrough engine", () => {
  test("lists scenes, marks which have branches, and resolves block ids to their enclosing scene", () => {
    expect(listGameScenes(FOG_BELL_SAMPLE)).toEqual([
      {
        id: "s4",
        index: 0,
        heading: "INT. CAR DECK - NIGHT",
        hasBranches: true,
      },
      {
        id: "s5",
        index: 1,
        heading: "INT. WHEELHOUSE - LATER",
        hasBranches: false,
      },
    ]);
    expect([
      sceneIdForBlock(FOG_BELL_SAMPLE, "d3"),
      sceneIdForBlock(FOG_BELL_SAMPLE, "s5"),
      sceneIdForBlock(FOG_BELL_SAMPLE, "d9"),
      sceneIdForBlock(FOG_BELL_SAMPLE, "missing"),
    ]).toEqual(["s4", "s5", "s5", null]);
  });

  test("stops at first choice group, walks nested choices, applies #set flags, and unlocks gated beats across scenes", () => {
    const start = replayGameScript(FOG_BELL_SAMPLE);
    expect(start.ended).toBe(false);
    expect(start.currentScene?.id).toBe("s4");
    expect(start.choices).toEqual([
      { index: 0, blockId: "c1", text: "Check the van", depth: 1 },
      { index: 1, blockId: "c2", text: "Leave it for Pike", depth: 1 },
    ]);
    expect(start.flags).toEqual([
      { name: "weather", value: "fog", manual: false },
      { name: "finn_found", value: false, manual: false },
      { name: "finn_trust", value: 0, manual: false },
    ]);

    // Pick 0: Check the van -> stops at nested ** choices
    const step1 = replayGameScript(FOG_BELL_SAMPLE, {
      choices: [{ index: 0, text: "Check the van", blockId: "c1" }],
    });
    expect(step1.choices).toEqual([
      { index: 0, blockId: "c1a", text: "Look through the glass", depth: 2 },
      { index: 1, blockId: "c1b", text: "Knock on the door", depth: 2 },
    ]);
    expect(step1.ended).toBe(false);

    // Pick 1: Knock on the door -> sets finn_found=true & finn_trust=1, gathers at -, unlocks FINN (O.S.) and Scene 5 beat
    const knock = replayGameScript(FOG_BELL_SAMPLE, {
      choices: [
        { index: 0, text: "Check the van", blockId: "c1" },
        { index: 1, text: "Knock on the door", blockId: "c1b" },
      ],
    });
    expect(knock.ended).toBe(true);
    expect(knock.choices).toEqual([]);
    expect(knock.flags).toEqual([
      { name: "weather", value: "fog", manual: false },
      { name: "finn_found", value: true, manual: false },
      { name: "finn_trust", value: 1, manual: false },
    ]);
    const speeches = knock.transcript
      .filter((item) => item.kind === "speech")
      .map((item) => `${item.character}: ${item.text}`);
    expect(speeches).toEqual([
      "PIKE: You counted them aboard?",
      "CAL: Ferry's full, whoever you are.",
      "FINN (O.S.): Don't tell her.",
      "CAL: Tell who?",
      "CAL: No. Just ours, and the water,",
      "CAL: There's a boy in the bread van.",
    ]);
    const inlineTagged = knock.transcript.find(
      (item) => item.kind === "speech" && item.blockId === "d8",
    );
    expect(inlineTagged?.kind === "speech" ? inlineTagged.tags : []).toEqual([
      "#sfx footsteps_metal.",
    ]);

    // Pick 1 at top level: Leave it for Pike -> skips FINN (O.S.) and Scene 5 gated beat
    const leave = replayGameScript(FOG_BELL_SAMPLE, {
      choices: [{ index: 1, text: "Leave it for Pike", blockId: "c2" }],
    });
    expect(leave.ended).toBe(true);
    const leaveSpeeches = leave.transcript
      .filter((item) => item.kind === "speech")
      .map((item) => `${item.character}: ${item.text}`);
    expect(leaveSpeeches).toEqual([
      "PIKE: You counted them aboard?",
      "CAL: There's a light on in that van.",
      "PIKE: There's a light on in your head.",
      "CAL: No. Just ours, and the water,",
    ]);
  });

  test("starts from a chosen scene, honours edited flags, supports manual custom conditions, and flags divergence", () => {
    // Start at Scene 5 without flag -> gated line hidden
    const s5Locked = replayGameScript(FOG_BELL_SAMPLE, { startSceneId: "s5" });
    expect(s5Locked.currentScene?.id).toBe("s5");
    expect(
      s5Locked.transcript.filter((i) => i.kind === "speech").map((i) => i.text),
    ).toEqual(["No. Just ours, and the water,"]);

    // Toggle finn_found = true -> gated line appears immediately
    const s5Unlocked = replayGameScript(FOG_BELL_SAMPLE, {
      startSceneId: "s5",
      editedFlags: [{ name: "finn_found", value: true }],
    });
    expect(
      s5Unlocked.transcript
        .filter((i) => i.kind === "speech")
        .map((i) => i.text),
    ).toEqual([
      "No. Just ours, and the water,",
      "There's a boy in the bread van.",
    ]);

    // Custom studio expression becomes a manual boolean flag
    const customBlocks: readonly BlockJSON[] = [
      b("cs1", "scene_heading", "INT. ENGINE ROOM - NIGHT"),
      b("cc1", "general", '{player.hasItem("spanner")}'),
      b("ca1", "action", "Pike nods at the spanner."),
      b("celse", "general", "{else}"),
      b("ca2", "action", "Pike hands over his own."),
    ];
    const customOff = replayGameScript(customBlocks);
    expect(customOff.flags).toEqual([
      { name: 'player.hasItem("spanner")', value: false, manual: true },
    ]);
    expect(
      customOff.transcript
        .filter((i) => i.kind === "action")
        .map((i) => i.text),
    ).toEqual(["Pike hands over his own."]);

    const customOn = replayGameScript(customBlocks, {
      editedFlags: [{ name: 'player.hasItem("spanner")', value: true }],
    });
    expect(
      customOn.transcript.filter((i) => i.kind === "action").map((i) => i.text),
    ).toEqual(["Pike nods at the spanner."]);

    // Diverged choice detection when script text changes
    const diverged = replayGameScript(FOG_BELL_SAMPLE, {
      choices: [{ index: 0, text: "Old deleted choice", blockId: "gone" }],
    });
    expect([diverged.diverged, diverged.keptChoices]).toEqual([true, []]);
  });

  test("handles conditional choices, #set += / -= arithmetic, gather text, and empty scripts", () => {
    const blocks: readonly BlockJSON[] = [
      b("a1", "scene_heading", "EXT. HARBOUR - DAWN"),
      b("a2", "general", "#set trust=1"),
      b("a3", "general", "#set trust+=2"),
      b("a4", "general", "* {trust >= 3} [Ask for the key]"),
      b("a5", "action", "She hands over the brass key."),
      b("a6", "general", "* [Say nothing]"),
      b("a7", "action", "Silence holds."),
      b("a8", "general", "- The ferry horn answers from the fog."),
    ];
    const res = replayGameScript(blocks, {
      choices: [{ index: 0, text: "Ask for the key", blockId: "a4" }],
    });
    expect(res.flags).toEqual([{ name: "trust", value: 3, manual: false }]);
    expect(
      res.transcript.filter((i) => i.kind === "action").map((i) => i.text),
    ).toEqual([
      "She hands over the brass key.",
      "The ferry horn answers from the fog.",
    ]);

    const empty = replayGameScript([]);
    expect([
      empty.scenes,
      empty.transcript,
      empty.choices,
      empty.ended,
    ]).toEqual([[], [], [], true]);
  });
});
