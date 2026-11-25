// The interface's own marks on a 120-page script: each surface, a setting, Preferences, another screen, switching
// person, start-up, and the facts and outline published while typing.
import { NotMeasured, benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import {
  caretAt,
  openCorpusScript,
  pressPaced,
  scriptBlocks,
  untilBlocks,
} from "../typing/run-typing.ts";
import {
  createMarkLog,
  openDialog,
  openPopover,
  openPreferences,
  openScriptAt,
  openSendScreen,
  pageNow,
  searchPalette,
  switchPerson,
  switchTheme,
  togglePanel,
} from "./drive.ts";

const PAGES = 120;
/** Times a process drives each interaction, and keys typed for the facts and the outline each time, by mode. */
const ROUNDS = {
  quick: { times: 1, keys: 3 },
  standard: { times: 20, keys: 200 },
  full: { times: 20, keys: 200 },
} as const;
const KEY_INTERVAL_MS = 60;
/** Every row of the interface's budget, in its order: each metric is the durations of the mark of its name. */
const INTERFACE_MARKS = [
  "app.frame",
  "ui.facts.publish",
  "ui.outline.publish",
  "ui.open.palette",
  "ui.open.panel",
  "ui.open.dialog",
  "ui.open.popover",
  "ui.open.screen",
  "ui.open.preferences",
  "ui.setting.apply",
  "ui.search.palette",
  "ui.switch.person",
] as const;

/**
 * In the corpus's screenplay of 120 pages (seed 1), as Dana, ROUNDS times a process: the palette opened and searched,
 * the status's popover, the left panel opened and closed, the Sync centre's dialog, the theme switched there and back,
 * Preferences, Dana switched to Sam and back, keys typed, the Send screen loaded, and a reload. Each metric is the
 * durations of the mark of its name the page kept during the interaction that records it; `input_blocks` beside them.
 * NotMeasured, naming them, when a mark recorded nothing.
 */
const scenario: Scenario = {
  id: "interface",
  workload: "W1",
  processes: 5,
  async run() {
    const rounds = ROUNDS[benchMode()];
    const demo = await startBenchDemo();
    try {
      const { page } = await demo.openPage({ userId: "dana" });
      const { d, docId } = await openCorpusScript(page, PAGES);
      const at = { url: demo.url, docId };
      const log = createMarkLog(page);
      const step = async (
        names: readonly string[],
        drive: () => Promise<void>,
      ): Promise<void> => {
        const fromMs = await pageNow(page);
        await drive();
        await log.gather(names, fromMs);
      };
      const blocks = await scriptBlocks(page);
      const typedIn = blocks[Math.floor(blocks.length / 2)]!.id;
      for (let n = 0; n < rounds.times; n++) {
        await step(["ui.open.palette", "ui.search.palette"], () =>
          searchPalette(page),
        );
        await step(["ui.open.popover"], () => openPopover(page));
        await step(["ui.open.panel"], () => togglePanel(page));
        await step(["ui.open.dialog"], () => openDialog(page));
        await step(["ui.setting.apply"], () => switchTheme(page));
        await step(["ui.open.preferences"], () =>
          openPreferences(page, d.blocks),
        );
        await step(["ui.switch.person"], () =>
          switchPerson(page, { from: "dana", to: "sam" }, d.blocks),
        );
        await step(["ui.facts.publish", "ui.outline.publish"], async () => {
          await caretAt(page, typedIn, "end");
          await pressPaced(
            page,
            Array.from({ length: rounds.keys }, () => "x"),
            KEY_INTERVAL_MS,
          );
        });
        // each is a load of its own, so it keeps only its own marks
        await openSendScreen(page, at);
        await log.gather(["ui.open.screen"], 0);
        await openScriptAt(page, at, d.blocks);
        await page.reload();
        await untilBlocks(page, d.blocks);
        await log.gather(["app.frame"], 0);
      }
      const missing = INTERFACE_MARKS.filter(
        (name) => log.durations(name).length === 0,
      );
      if (missing.length > 0)
        throw new NotMeasured(`no ${missing.join(", ")} mark was recorded`);
      return [
        ...INTERFACE_MARKS.map((name) =>
          measurement(name, "ms", log.durations(name)),
        ),
        inputBlocks(d.blocks),
      ];
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
