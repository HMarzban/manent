import { withDom } from "@manent/testkit/dom";
import type { BlockJSON } from "@manent/schema";
import { INK_WORDS } from "@manent/ui";
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  triggerGameBack,
  triggerGamePlay,
  triggerGamePlayFromScene,
  triggerGameRestart,
} from "../src/game/player/controller.ts";
import { GamePlayerBeside } from "../src/game/player/game-player.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import {
  MemoryStorage,
  createClock,
  createStorageEvents,
  testEnvironment,
} from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

function b(id: string, type: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

const SAMPLE_BLOCKS: readonly BlockJSON[] = [
  b("s1", "scene_heading", "EXT. FERRY SLIP - NIGHT"),
  b("a1", "action", "Fog sits on the slip like wet wool."),
  b("s4", "scene_heading", "INT. CAR DECK - NIGHT"),
  b("e1", "engine", "LOAD car_deck_fog · PLAYER cal"),
  b("set0", "general", "#set weather=fog"),
  b("cam1", "camera", "HOLD WIDE ON THE VAN."),
  b("em1", "emote", "PIKE: FLAT · CAL: STUNG"),
  b("c1", "general", "* [Check the van]"),
  b("c1a", "general", "** [Look through the glass]"),
  b("ch1", "character", "CAL"),
  b("d1", "dialogue", "Twelve on foot."),
  b("set1", "general", "#set finn_found=true"),
  b("c1b", "general", "** [Knock on the door]"),
  b("ch2", "character", "CAL"),
  b("d2", "dialogue", "Ferry's full, whoever you are."),
  b("set2", "general", "#set finn_found=true"),
  b("set3", "general", "#set finn_trust=1"),
  b("c2", "general", "* [Leave it for Pike]"),
  b("ch3", "character", "PIKE"),
  b("d3", "dialogue", "Go up and read your sister the sounder."),
  b("g1", "general", "-"),
  b("cond1", "general", "{finn_trust >= 1}"),
  b("ch4", "character", "FINN (O.S.)"),
  b("p4", "parenthetical", "(a whisper)"),
  b("d4", "dialogue", "Don't tell her."),
];

async function flushUi(turns = 8): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountGamePlayer(options: {
  docId: string;
  blocks: readonly BlockJSON[];
  onGoTo?: (blockId: string) => void;
}): Promise<HTMLDivElement> {
  const clock = createClock();
  const storage = new MemoryStorage();
  const storageEvents = createStorageEvents();
  const environment = testEnvironment({
    storage,
    storageEvents: storageEvents.events,
    now: clock.now,
    schedule: clock.schedule,
  });
  const services = {
    userId: "sam",
    documentBlocks: async () => options.blocks,
    editor: {
      run: async (action: { kind: string; blockId?: string }) => {
        if (action.kind === "go_to" && typeof action.blockId === "string") {
          options.onGoTo?.(action.blockId);
        }
        return true;
      },
    },
  } as unknown as PersonServices;

  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <GamePlayerBeside docId={options.docId} at={null} />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  await flushUi();
  return container;
}

describe("GamePlayerBeside interactive playback, cues, flags, scene picker, and keyboard controls", () => {
  test("plays choices, updates #set flags, unlocks {condition} dialogue, toggles cues, and jumps to source blocks", async () => {
    const jumped: string[] = [];
    triggerGamePlay("game-doc-1");
    const root = await mountGamePlayer({
      docId: "game-doc-1",
      blocks: SAMPLE_BLOCKS,
      onGoTo: (blockId) => jumped.push(blockId),
    });

    // Shows choices from Scene 4 and styled cues
    const choices = () =>
      [
        ...root.querySelectorAll<HTMLButtonElement>(
          '[data-tour="ink:choices"] button',
        ),
      ].map((btn) => btn.textContent);
    expect(choices()).toEqual(["1Check the van", "2Leave it for Pike"]);
    expect(root.textContent).toContain("PIKE: FLAT · CAL: STUNG");
    expect(root.textContent).toContain("HOLD WIDE ON THE VAN.");

    // Toggle Cues off hides emote/camera/engine cues
    const cuesBtn = root.querySelector<HTMLButtonElement>(
      `button[aria-label="${INK_WORDS.cuesHideLabel}"]`,
    );
    expect(cuesBtn?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      cuesBtn?.click();
    });
    expect(root.textContent).not.toContain("PIKE: FLAT · CAL: STUNG");
    expect(root.textContent).not.toContain("HOLD WIDE ON THE VAN.");

    // Choose "Check the van" via digit key 1, then "Knock on the door" via digit key 2
    const playerEl = root.querySelector<HTMLElement>(
      '[data-tour="game:player"]',
    );
    await act(async () => {
      playerEl?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "1", bubbles: true }),
      );
    });
    expect(choices()).toEqual([
      "1Look through the glass",
      "2Knock on the door",
    ]);

    await act(async () => {
      playerEl?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "2", bubbles: true }),
      );
    });
    expect(choices()).toEqual([]);
    expect(root.textContent).toContain("FINN (O.S.)");
    expect(root.textContent).toContain("Don't tell her.");
    expect(root.textContent).toContain(INK_WORDS.theEnd);

    // Clicking a dialogue row jumps directly to its block ID in the editor
    const finnBtn = [
      ...root.querySelectorAll<HTMLButtonElement>(
        `[aria-label="${INK_WORDS.transcriptLabel}"] button`,
      ),
    ].find((btn) => btn.textContent?.includes("Don't tell her."));
    await act(async () => {
      finnBtn?.click();
    });
    expect(jumped).toEqual(["d4"]);

    // Back command steps back one choice cleanly
    await act(async () => {
      triggerGameBack("game-doc-1");
    });
    expect(choices()).toEqual([
      "1Look through the glass",
      "2Knock on the door",
    ]);

    // Restart command resets to first choice group
    await act(async () => {
      triggerGameRestart("game-doc-1");
    });
    expect(choices()).toEqual(["1Check the van", "2Leave it for Pike"]);
  });

  test("supports Play from here, Scene switcher, Flags drawer edits, and empty script state", async () => {
    triggerGamePlayFromScene("game-doc-2", "s4");
    const root = await mountGamePlayer({
      docId: "game-doc-2",
      blocks: SAMPLE_BLOCKS,
    });

    // Starts directly at Scene 4 (skipping Scene 1 action)
    expect(root.textContent).toContain("INT. CAR DECK - NIGHT");
    expect(root.textContent).not.toContain("Fog sits on the slip");

    const sceneSelect = root.querySelector<HTMLSelectElement>(
      '[data-tour="game:scene-select"]',
    );
    expect(sceneSelect?.value).toBe("s4");

    // Open Flags drawer and inspect discovered flags
    const flagsBtn = [
      ...root.querySelectorAll<HTMLButtonElement>("button"),
    ].find((btn) => btn.textContent?.includes("Flags (3)"));
    expect(flagsBtn).not.toBeUndefined();
    await act(async () => {
      flagsBtn?.click();
    });
    expect(root.querySelector('[data-ink-variables="true"]')).not.toBeNull();
    expect(root.textContent).toContain("finn_trust");

    // Empty script renders compact EmptyHeroCard
    act(() => mounted?.unmount());
    mounted = null;
    const emptyRoot = await mountGamePlayer({
      docId: "game-doc-empty",
      blocks: [],
    });
    expect(emptyRoot.textContent).toContain(INK_WORDS.emptyGameScriptTitle);
    expect(emptyRoot.textContent).toContain(INK_WORDS.emptyGameScriptDetail);
  });
});
