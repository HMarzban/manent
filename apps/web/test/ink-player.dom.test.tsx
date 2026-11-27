import { withDom } from "@manent/testkit/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { INK_WORDS } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  closeInkCompileClient,
  openInkCompileClient,
} from "../src/ink/compile-client.ts";
import type { InkRpcTransport } from "../src/ink/compile-client.ts";
import { createInkWorkerHandler } from "../src/ink/compile.worker.ts";
import type {
  InkWorkerRequest,
  InkWorkerResponse,
} from "../src/ink/compile.worker.ts";
import { createInkPlayerController } from "../src/ink/player/controller.ts";
import { InkPlayerBeside } from "../src/ink/player/ink-player.tsx";
import { createInkPlaythroughStore } from "../src/ink/player/storage.ts";
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
const openDocIds: string[] = [];

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  for (const docId of openDocIds.splice(0)) closeInkCompileClient(docId);
  document.body.replaceChildren();
});

async function flushUi(turns = 12): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPlayer(docId: string): Promise<HTMLDivElement> {
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
    userId: "tester",
    editor: { run: async () => true },
  } as unknown as PersonServices;

  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <InkPlayerBeside docId={docId} at={null} />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  await flushUi();
  return container;
}

function dispatchInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

describe("InkPlayerBeside empty/recovery states, resilience, and WCAG 2.2 accessibility", () => {
  test("renders compact EmptyHeroCard for ready and nothingCompiled states and bg-raised choices", async () => {
    const docBad = "ink-bad-1";
    openDocIds.push(docBad);
    const badClient = openInkCompileClient(docBad);
    await badClient.compileNow("-> missing_knot");

    const badRoot = await mountPlayer(docBad);
    expect(badRoot.textContent).toContain(INK_WORDS.problemsCount(1));
    expect(badRoot.textContent).toContain(INK_WORDS.nothingCompiled);
    const seeLineBtn = badRoot.querySelector<HTMLButtonElement>(
      '[data-tour="ink:problems"]:not(header *)',
    );
    expect(seeLineBtn).not.toBeNull();
    expect(badRoot.textContent).toContain(INK_WORDS.seeLine);

    act(() => mounted?.unmount());
    mounted = null;

    const docGood = "ink-good-1";
    openDocIds.push(docGood);
    const goodClient = openInkCompileClient(docGood);
    await goodClient.compileNow("Hello.\n* [First] One.\n* [Second] Two.");

    const root = await mountPlayer(docGood);
    expect(root.textContent).toContain(INK_WORDS.playerReadyTitle);
    expect(root.textContent).toContain(INK_WORDS.pressPlay);

    const playBtn = root.querySelector<HTMLButtonElement>(
      '[data-tour="ink:play"]',
    );
    expect(playBtn).not.toBeNull();
    await act(async () => {
      playBtn!.click();
    });
    await flushUi();

    const choiceButtons = root.querySelectorAll<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    );
    expect(choiceButtons.length).toBe(2);
    expect(choiceButtons[0]!.className).toContain("bg-raised");
    expect(choiceButtons[0]!.className).not.toContain("bg-surface");

    // CompileBadge has role="status" and aria-live="polite".
    const statusRegions = [
      ...root.querySelectorAll('[role="status"][aria-live="polite"]'),
    ];
    expect(
      statusRegions.some((el) => el.textContent?.includes(INK_WORDS.upToDate)),
    ).toBe(true);
  });

  test("shows calm worker-stopped recovery card with role=alert and recovers on Restart player", async () => {
    const docId = "ink-crash-ui";
    openDocIds.push(docId);
    let generation = 0;
    let failNextProceed = false;

    const client = openInkCompileClient(docId, {
      createTransport: (): InkRpcTransport => {
        generation += 1;
        const myGen = generation;
        const handler = createInkWorkerHandler();
        return {
          async send(req: InkWorkerRequest): Promise<InkWorkerResponse> {
            if (myGen === 1 && failNextProceed && req.kind === "choose") {
              throw new Error("worker crashed");
            }
            return handler(req);
          },
          close() {},
        };
      },
    });
    await client.compileNow("Start.\n* [Go] Next.");

    const root = await mountPlayer(docId);
    await act(async () => {
      root.querySelector<HTMLButtonElement>('[data-tour="ink:play"]')!.click();
    });
    await flushUi();

    // Crash on choose.
    failNextProceed = true;
    const choiceBtn = root.querySelector<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    )!;
    await act(async () => {
      choiceBtn.click();
    });
    await flushUi();

    expect(root.textContent).toContain(INK_WORDS.playerStoppedTitle);
    const alertEl = root.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain(INK_WORDS.playerStoppedDetail);

    const restartBtn = [...root.querySelectorAll("button")].find(
      (btn) => btn.textContent === INK_WORDS.restartPlayer,
    );
    expect(restartBtn).not.toBeUndefined();
    expect(restartBtn!.disabled).toBe(false);

    await act(async () => {
      restartBtn!.click();
    });
    await flushUi();

    expect(generation).toBe(2);
    expect(
      root.querySelector('[data-tour="ink:choices"] button'),
    ).not.toBeNull();
    expect(root.textContent).toContain("Start.");
  });

  test("controller clears busy=false on RPC rejection during replay and choose", async () => {
    const docId = "ink-busy-reject";
    openDocIds.push(docId);
    let rejectChoose = false;
    let rejectRestart = false;

    const client = openInkCompileClient(docId, {
      createTransport: (): InkRpcTransport => {
        const handler = createInkWorkerHandler();
        return {
          async send(req) {
            if (rejectRestart && req.kind === "restart")
              throw new Error("restart rejected");
            if (rejectChoose && req.kind === "choose")
              throw new Error("choose rejected");
            return handler(req);
          },
          close() {},
        };
      },
    });
    await client.compileNow("Intro.\n* [Pick] Done.");

    const store = createInkPlaythroughStore({
      storage: new MemoryStorage(),
      events: createStorageEvents().events,
      userId: "u1",
    });
    const ctrl = createInkPlayerController({ docId, store, now: () => 1 });

    // Reject during initial play/replay -> busy must clear.
    rejectRestart = true;
    ctrl.play();
    await flushUi();
    expect(ctrl.snapshot().busy).toBe(false);
    expect(ctrl.snapshot().workerStopped).toBe(true);

    // Recover and play cleanly.
    rejectRestart = false;
    ctrl.restartWorker();
    await flushUi();
    expect(ctrl.snapshot().busy).toBe(false);
    expect(ctrl.snapshot().workerStopped).toBe(false);
    expect(ctrl.snapshot().choices.length).toBe(1);

    // Reject during choose -> busy must clear.
    rejectChoose = true;
    ctrl.choose(ctrl.snapshot().choices[0]!);
    await flushUi();
    expect(ctrl.snapshot().busy).toBe(false);
    expect(ctrl.snapshot().workerStopped).toBe(true);

    ctrl.dispose();
    store.dispose();
  });

  test("VariablesDrawer wires aria-controls/region, handles clearing and negative numeric draft, and scopes keyboard keys", async () => {
    const docId = "ink-vars-a11y";
    openDocIds.push(docId);
    const client = openInkCompileClient(docId);
    await client.compileNow(
      [
        "VAR score = 5",
        "VAR ready = true",
        "Line one.",
        "* [Alpha] Chose alpha.",
        "* [Beta] Chose beta.",
      ].join("\n"),
    );

    const root = await mountPlayer(docId);
    await act(async () => {
      root.querySelector<HTMLButtonElement>('[data-tour="ink:play"]')!.click();
    });
    await flushUi();

    const varsBtn = [...root.querySelectorAll("button")].find((btn) =>
      btn.textContent?.includes("Variables"),
    )!;
    const controlsId = varsBtn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(varsBtn.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      varsBtn.click();
    });
    await flushUi();

    expect(varsBtn.getAttribute("aria-expanded")).toBe("true");
    const drawer = root.querySelector<HTMLElement>(
      `#${CSS.escape(controlsId!)}`,
    );
    expect(drawer).not.toBeNull();
    expect(drawer!.getAttribute("role")).toBe("region");
    expect(drawer!.getAttribute("aria-label")).toBeTruthy();

    // Numeric input: clearing to "" does not snap to 0, blur restores last valid value, negative commits.
    const numInput = drawer!.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    expect(numInput.value).toBe("5");

    await act(async () => {
      numInput.focus();
    });
    await act(async () => {
      dispatchInputValue(numInput, "");
    });
    expect(numInput.value).toBe("");
    // Should NOT have committed 0 to variables.
    expect(await client.variables()).toEqual([
      { name: "score", value: 5 },
      { name: "ready", value: true },
    ]);

    await act(async () => {
      numInput.blur();
    });
    expect(numInput.value).toBe("5");

    await act(async () => {
      numInput.focus();
    });
    await act(async () => {
      dispatchInputValue(numInput, "-");
    });
    // Typing "-" alone must not snap to 0 or commit.
    expect(await client.variables()).toEqual([
      { name: "score", value: 5 },
      { name: "ready", value: true },
    ]);

    await act(async () => {
      dispatchInputValue(numInput, "-12");
    });
    await flushUi();
    expect(numInput.value).toBe("-12");
    expect(await client.variables()).toEqual([
      { name: "score", value: -12 },
      { name: "ready", value: true },
    ]);

    // Keyboard scoping: pressing "1" or ArrowDown on Switch inside VariablesDrawer does NOT pick a choice or move focus.
    const switchEl = drawer!.querySelector<HTMLElement>('[role="switch"]')!;
    await act(async () => {
      switchEl.focus();
      switchEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "1",
          bubbles: true,
          cancelable: true,
        }),
      );
      switchEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flushUi();
    expect(root.textContent).not.toContain("Chose alpha.");
    expect(document.activeElement).toBe(switchEl);

    // Keyboard scoping: ArrowDown on a transcript passage button is NOT hijacked.
    const passageBtn = root.querySelector<HTMLButtonElement>(
      `[aria-label="${INK_WORDS.transcriptLabel}"] button`,
    )!;
    const transcriptArrow = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      passageBtn.focus();
      passageBtn.dispatchEvent(transcriptArrow);
    });
    expect(transcriptArrow.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(passageBtn);

    // Keyboard scoping: ArrowDown inside choices moves focus between choices.
    const choiceBtns = root.querySelectorAll<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    );
    const choiceArrow = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      choiceBtns[0]!.focus();
      choiceBtns[0]!.dispatchEvent(choiceArrow);
    });
    expect(choiceArrow.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(choiceBtns[1]!);
  });

  test("transfers focus to fault alert container when choices unmount and announces live statuses", async () => {
    const docId = "ink-fault-live";
    openDocIds.push(docId);
    let forceFault = false;
    const client = openInkCompileClient(docId, {
      createTransport: (): InkRpcTransport => {
        const handler = createInkWorkerHandler();
        return {
          async send(req) {
            if (forceFault && req.kind === "choose") {
              return {
                id: req.id,
                kind: "action",
                result: {
                  ok: false,
                  line: 2,
                  message: "Runtime fault occurred",
                },
              };
            }
            return handler(req);
          },
          close() {},
        };
      },
    });
    await client.compileNow("Opening.\n* [Trigger] Next.");

    const root = await mountPlayer(docId);
    await act(async () => {
      root.querySelector<HTMLButtonElement>('[data-tour="ink:play"]')!.click();
    });
    await flushUi();

    // Verify transcript additions container has aria-live="polite".
    expect(
      root.querySelector('[role="log"][aria-live="polite"]')?.textContent,
    ).toContain("Opening.");

    // Trigger playingLastGood status announcement by compiling broken source after valid compile.
    await act(async () => {
      await client.compileNow("-> broken_target");
    });
    await flushUi();
    const liveStatuses = [
      ...root.querySelectorAll('[role="status"][aria-live="polite"]'),
    ];
    expect(
      liveStatuses.some((el) =>
        el.textContent?.includes(INK_WORDS.playingLastGood),
      ),
    ).toBe(true);

    // Trigger diverged + ended statuses via a valid recompile that changes choices after taking one.
    await act(async () => {
      await client.compileNow("Opening.\n* [Trigger] Finished.");
    });
    await flushUi();
    const triggerChoice = root.querySelector<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    )!;
    await act(async () => {
      triggerChoice.click();
    });
    await flushUi();
    const endedStatuses = [
      ...root.querySelectorAll('[role="status"][aria-live="polite"]'),
    ];
    expect(
      endedStatuses.some((el) => el.textContent?.includes(INK_WORDS.theEnd)),
    ).toBe(true);

    // Recompile removing [Trigger] -> triggers snap.diverged live status.
    await act(async () => {
      await client.compileNow("Opening.\n* [Different] Elsewhere.");
    });
    await flushUi();
    const divergedStatuses = [
      ...root.querySelectorAll('[role="status"][aria-live="polite"]'),
    ];
    expect(
      divergedStatuses.some((el) =>
        el.textContent?.includes(INK_WORDS.storyChanged),
      ),
    ).toBe(true);

    // Now force a fault while a choice is focused -> choices unmount and focus lands on fault alert container.
    const diffChoice = root.querySelector<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    )!;
    diffChoice.focus();
    forceFault = true;
    await act(async () => {
      diffChoice.click();
    });
    await flushUi();

    const faultAlert = root.querySelector<HTMLElement>('[role="alert"]');
    expect(faultAlert).not.toBeNull();
    expect(faultAlert!.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(faultAlert);
  });
});
