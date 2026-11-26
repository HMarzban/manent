import { withDom } from "@manent/testkit/dom";
import type { RundownRowJSON } from "@manent/schema";
import type {
  PrompterOperator,
  PrompterScrollState,
} from "@manent/sync-protocol";
import {
  PROMPTER_CONTROL_WORDS,
  TimingProvider,
  stateBarLines,
} from "@manent/ui";
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  fetchPrompterControlStatus,
  postPrompterOperatorRelease,
  postPrompterOperatorTake,
  postPrompterScrollCommand,
} from "../src/prompter/prompter-http.ts";
import {
  computeRemoteScrollTop,
  createRemoteScrollController,
} from "../src/prompter/remote-scroll.ts";
import type {
  PrompterFollowMode,
  RemoteScrollContainer,
} from "../src/prompter/remote-scroll.ts";
import { PrompterControlBar } from "../src/rundown/prompter-control-bar.tsx";
import { canJumpRowToPrompter } from "../src/rundown/row-actions.ts";
import { PrompterBar } from "../src/screens/present/prompter/prompter-bar.tsx";
import type { PrompterReadingStory } from "../src/screens/present/prompter/prompter-blocks.ts";
import { PrompterReading } from "../src/screens/present/prompter/prompter-reading.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { prompterActions } from "../src/state/prompter.store.ts";
import { writePerson } from "../src/session.ts";
import {
  MemoryStorage,
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const NOW = new Date(2026, 10, 18, 12, 0, 0).getTime();
const DOC_ID = "00000000-0000-4000-8000-000000000101";
const ROW_SENT_ID = "00000000-0000-4000-8000-000000000201";
const ROW_UNSENT_ID = "00000000-0000-4000-8000-000000000202";

const STORIES: readonly PrompterReadingStory[] = [
  {
    rowId: ROW_SENT_ID,
    blocks: [
      { key: "b1", rowId: ROW_SENT_ID, kind: "character", text: "HOST" },
      {
        key: "b2",
        rowId: ROW_SENT_ID,
        kind: "dialogue",
        text: "Good evening and welcome.",
      },
      {
        key: "b3",
        rowId: ROW_SENT_ID,
        kind: "dialogue",
        text: "Top story tonight from studio one.",
      },
    ],
  },
];

let mounted: Root | null = null;
const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (mounted !== null) {
    await act(async () => {
      mounted?.unmount();
    });
    mounted = null;
  }
  document.body.replaceChildren();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFakeContainer(storyTopPx: number): RemoteScrollContainer {
  const storyEl = {
    offsetTop: storyTopPx,
    getBoundingClientRect: () => ({
      top: storyTopPx,
      bottom: storyTopPx + 400,
      left: 0,
      right: 800,
      width: 800,
      height: 0,
      x: 0,
      y: storyTopPx,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
  return {
    scrollTop: 0,
    scrollHeight: 4000,
    clientHeight: 1000,
    querySelector: (<T extends Element>(selector: string): T | null =>
      selector.includes(ROW_SENT_ID)
        ? (storyEl as unknown as T)
        : null) as RemoteScrollContainer["querySelector"],
    getBoundingClientRect: () => ({
      top: 0,
      bottom: 1000,
      left: 0,
      right: 800,
      width: 800,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  };
}

describe("pure rAF remote scroll controller", () => {
  test("interpolates scrollTop from server anchor + clock offset and halts immediately on Feed lost", () => {
    let nowMs = NOW;
    const frames: Array<() => void> = [];
    const container = makeFakeContainer(500);
    const modes: PrompterFollowMode[] = [];

    const controller = createRemoteScrollController({
      getContainer: () => container,
      getLinePx: () => 50,
      now: () => nowMs,
      requestFrame: (cb) => {
        frames.push(cb);
        let cancelled = false;
        return () => {
          cancelled = true;
          const idx = frames.indexOf(cb);
          if (idx >= 0) frames.splice(idx, 1);
          void cancelled;
        };
      },
      onModeChange: (m) => modes.push(m),
    });

    const anchor: PrompterScrollState = {
      seq: 1,
      playing: true,
      linesPerSecond: 2,
      rowId: ROW_SENT_ID,
      lineOffset: 0,
      updatedAt: NOW + 100, // server clock is 100 ms ahead
      operatorUserId: "ana",
      operatorDeviceId: "dev-ana",
    };

    controller.setAnchor(anchor, 100);
    expect(frames).toHaveLength(1);

    // At t = NOW + 1000 ms (serverNow = NOW + 1100 ms, elapsed = 1 s => 2 lines => 100 px)
    // eyeLinePx = 30% of 1000 = 300; storyBaseTop = 500 - 300 = 200; target = 200 + 100 = 300
    nowMs = NOW + 1000;
    frames.shift()?.();
    expect(container.scrollTop).toBe(300);
    expect(frames).toHaveLength(1);

    // Feed lost halts rAF immediately and leaves scrollTop untouched
    controller.setFeedLive(false);
    expect(frames).toHaveLength(0);
    nowMs = NOW + 3000;
    expect(container.scrollTop).toBe(300);

    // Local wheel/touch override switches to Free scroll immediately
    controller.setFeedLive(true);
    expect(frames).toHaveLength(1);
    controller.notifyOwnMove();
    expect(controller.getMode()).toBe("free");
    expect(modes).toEqual(["free"]);
    expect(frames).toHaveLength(0);

    // Re-joining Follow snaps to current live anchor
    controller.setMode("follow");
    expect(modes).toEqual(["free", "follow"]);
    expect(frames).toHaveLength(1);
    frames.shift()?.();
    expect(container.scrollTop).toBe(
      computeRemoteScrollTop({
        container,
        anchor,
        clockOffsetMs: 100,
        nowMs,
        linePx: 50,
      }),
    );

    controller.dispose();
  });
});

describe("PrompterBar and PrompterReading remote control UI", () => {
  test("renders eye-line guide at 30%, 30vh/70vh padding, Follow/Free scroll switch, and 0 React renders across rAF ticks", async () => {
    let nowMs = NOW;
    const frames: Array<() => void> = [];
    const environment = testEnvironment({
      now: () => nowMs,
      frame: (cb) => {
        frames.push(cb);
        return () => {
          const idx = frames.indexOf(cb);
          if (idx >= 0) frames.splice(idx, 1);
        };
      },
    });
    const modes: PrompterFollowMode[] = [];
    let renderCount = 0;

    function ReadingProbe(props: { readonly followMode: PrompterFollowMode }) {
      renderCount += 1;
      return (
        <PrompterReading
          surfaceState={{ kind: "ready" }}
          stories={STORIES}
          textSize={48}
          mirror={false}
          remoteScroll={{
            state: {
              seq: 2,
              playing: true,
              linesPerSecond: 3,
              rowId: ROW_SENT_ID,
              lineOffset: 0,
              updatedAt: NOW,
              operatorUserId: "ana",
              operatorDeviceId: "dev-1",
            },
            clockOffsetMs: 0,
          }}
          followMode={props.followMode}
          onFollowModeChange={(m) => modes.push(m)}
          clock={{ now: environment.now, frame: environment.frame }}
        />
      );
    }

    const operator: PrompterOperator = {
      userId: "ana",
      name: "Ana",
      deviceId: "dev-1",
      since: NOW,
      expiresAt: NOW + 30_000,
    };

    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    await act(async () => {
      mounted?.render(
        <TimingProvider
          timing={{ now: environment.now, schedule: environment.schedule }}
        >
          <EnvironmentProvider environment={environment}>
            <PrompterBar
              status={{ kind: "lost", lastReceivedAt: NOW }}
              view={{ v: 1, textSize: 48, dark: true, mirror: false }}
              operator={operator}
              scroll={{
                seq: 2,
                playing: true,
                linesPerSecond: 3,
                rowId: ROW_SENT_ID,
                lineOffset: 0,
                updatedAt: NOW,
                operatorUserId: "ana",
                operatorDeviceId: "dev-1",
              }}
              followMode="follow"
              onFollowModeChange={(m) => modes.push(m)}
              onTextSizeChange={() => {}}
              onDarkChange={() => {}}
              onMirrorChange={() => {}}
            />
            <ReadingProbe followMode="follow" />
          </EnvironmentProvider>
        </TimingProvider>,
      );
    });

    // Bar shows Follow | Free scroll switch, operator name, and paused-on-loss status
    expect(
      container.querySelector('[data-tour="prompter:follow_switch"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      PROMPTER_CONTROL_WORDS.controlsPrompter("Ana"),
    );
    expect(container.textContent).toContain("scrolling paused");

    // Eye-line guide at 30% and 30vh/70vh reading padding
    const guide = container.querySelector<HTMLElement>(".mn-prompter-guide");
    expect(guide).not.toBeNull();
    expect(guide?.style.top).toBe("30%");
    const bodyWrap = container.querySelector<HTMLElement>(
      "[data-prompter-mirror]",
    );
    expect(bodyWrap?.style.paddingTop).toBe("30vh");
    expect(bodyWrap?.style.paddingBottom).toBe("70vh");

    // 5 animation frames run with ZERO React re-renders
    const rendersBeforeFrames = renderCount;
    for (let i = 1; i <= 5; i++) {
      nowMs = NOW + i * 16;
      frames.shift()?.();
    }
    expect(renderCount).toBe(rendersBeforeFrames);

    // Local wheel event switches to Free scroll immediately; F key rejoins Follow
    const main = container.querySelector("main");
    await act(async () => {
      main?.dispatchEvent(new Event("wheel", { bubbles: true }));
    });
    expect(modes).toEqual(["free"]);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    });
    expect(modes).toEqual(["free", "follow"]);
  });
});

describe("StateBar prompter facts and HTTP routes", () => {
  test("formats prompter_ready (with data-tour) and prompter_held right-side facts after viewing_version", () => {
    const ready = stateBarLines([{ kind: "prompter_ready" }]);
    expect(ready.right?.sentence).toBe(PROMPTER_CONTROL_WORDS.prompterReady);
    expect(ready.right?.actions).toEqual([
      {
        label: PROMPTER_CONTROL_WORDS.takeControl,
        commandId: "prompter.takeControl",
        tourTarget: "prompter:take_control",
      },
    ]);

    const held = stateBarLines([
      { kind: "prompter_held", name: "Ana", canTakeOver: true },
    ]);
    expect(held.right?.sentence).toBe(
      PROMPTER_CONTROL_WORDS.controlsPrompter("Ana"),
    );
    expect(held.right?.actions).toEqual([
      {
        label: PROMPTER_CONTROL_WORDS.takeOver,
        commandId: "prompter.takeOver",
      },
    ]);

    const heldReadOnly = stateBarLines([
      { kind: "prompter_held", name: "Ana", canTakeOver: false },
    ]);
    expect(heldReadOnly.right?.actions).toEqual([]);

    // viewing_version still takes precedence over prompter_ready
    const versionWins = stateBarLines([
      { kind: "viewing_version", name: "Draft 1", date: "18 Nov" },
      { kind: "prompter_ready" },
    ]);
    expect(versionWins.right?.sentence).toBe("Viewing Draft 1, 18 Nov");
  });

  test("uses exact static /api/prompter/... pathnames with docId in query/body", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const op: PrompterOperator = {
      userId: "ana",
      name: "Ana",
      deviceId: "dev-1",
      since: NOW,
      expiresAt: NOW + 30_000,
    };
    const scroll: PrompterScrollState = {
      seq: 1,
      playing: true,
      linesPerSecond: 3,
      rowId: ROW_SENT_ID,
      lineOffset: 0,
      updatedAt: NOW,
      operatorUserId: "ana",
      operatorDeviceId: "dev-1",
    };

    const fakeFetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      if (url.startsWith("/api/prompter/control?docId="))
        return jsonResponse({ operator: op, scroll, serverTime: NOW });
      if (url === "/api/prompter/operator/take")
        return jsonResponse({ operator: op, serverTime: NOW });
      if (url === "/api/prompter/operator/release")
        return jsonResponse({ operator: null, serverTime: NOW });
      if (url === "/api/prompter/control")
        return jsonResponse({ operator: op, scroll, serverTime: NOW });
      return jsonResponse({ error: "not_found" }, 404);
    }) as unknown as typeof fetch;

    const status = await fetchPrompterControlStatus(DOC_ID, "tok", fakeFetch);
    expect(status?.operator?.userId).toBe("ana");

    const taken = await postPrompterOperatorTake(
      DOC_ID,
      { deviceId: "dev-1", expectedUserId: null },
      "tok",
      fakeFetch,
    );
    expect(taken.ok).toBe(true);

    const cmd = await postPrompterScrollCommand(
      DOC_ID,
      { action: "play", deviceId: "dev-1", linesPerSecond: 3 },
      "tok",
      fakeFetch,
    );
    expect(cmd.ok).toBe(true);

    const released = await postPrompterOperatorRelease(
      DOC_ID,
      { deviceId: "dev-1" },
      "tok",
      fakeFetch,
    );
    expect(released?.operator).toBeNull();

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET /api/prompter/control?docId=${encodeURIComponent(DOC_ID)}`,
      "POST /api/prompter/operator/take",
      "POST /api/prompter/control",
      "POST /api/prompter/operator/release",
    ]);
    expect((calls[1]?.body as { docId?: string } | undefined)?.docId).toBe(
      DOC_ID,
    );
    expect((calls[2]?.body as { docId?: string } | undefined)?.docId).toBe(
      DOC_ID,
    );
    expect((calls[3]?.body as { docId?: string } | undefined)?.docId).toBe(
      DOC_ID,
    );
  });
});

describe("PrompterControlBar and row jump eligibility", () => {
  test("mounts docked bar only while holding operator lease, handles controls, shortcuts and Stop controlling", async () => {
    const clock = createClock(NOW);
    const storage = new MemoryStorage();
    const tabStorage = new MemoryStorage();
    writePerson(tabStorage, {
      userId: "ana",
      name: "Ana",
      token: "ana-token",
    });
    const environment = testEnvironment({
      now: clock.now,
      schedule: clock.schedule,
      storage,
      tabStorage,
    });
    bindGuard(environment.guard);
    const services = testServices({ userId: "ana", environment });

    const requests: Array<{
      url: string;
      body: Record<string, unknown> | null;
    }> = [];
    let seq = 0;
    let activeOp: PrompterOperator | null = null;
    let currentScroll: PrompterScrollState | null = null;

    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = typeof input === "string" ? input : input.toString();
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
      requests.push({ url, body });

      if (url === "/api/docs/describe")
        return jsonResponse({ capabilities: ["send_to_prompter"] });
      if (url.startsWith("/api/prompter/control?docId="))
        return jsonResponse({
          operator: activeOp,
          scroll: currentScroll,
          serverTime: clock.now(),
        });
      if (url === "/api/prompter/operator/take") {
        activeOp = {
          userId: "ana",
          name: "Ana",
          deviceId: String(body?.deviceId ?? "dev"),
          since: clock.now(),
          expiresAt: clock.now() + 30_000,
        };
        return jsonResponse({ operator: activeOp, serverTime: clock.now() });
      }
      if (url === "/api/prompter/operator/release") {
        activeOp = null;
        return jsonResponse({ operator: null, serverTime: clock.now() });
      }
      if (url === "/api/prompter/control") {
        seq += 1;
        const action = body?.action;
        currentScroll = {
          seq,
          playing:
            action === "play"
              ? true
              : action === "pause"
                ? false
                : (currentScroll?.playing ?? false),
          linesPerSecond:
            typeof body?.linesPerSecond === "number"
              ? body.linesPerSecond
              : (currentScroll?.linesPerSecond ?? 3),
          rowId:
            typeof body?.rowId === "string"
              ? body.rowId
              : (currentScroll?.rowId ?? null),
          lineOffset:
            typeof body?.deltaLines === "number"
              ? (currentScroll?.lineOffset ?? 0) + body.deltaLines
              : 0,
          updatedAt: clock.now(),
          operatorUserId: "ana",
          operatorDeviceId: activeOp?.deviceId ?? "dev",
        };
        return jsonResponse({
          operator: activeOp,
          scroll: currentScroll,
          serverTime: clock.now(),
        });
      }
      return jsonResponse({ error: "not_found" }, 404);
    }) as unknown as typeof fetch;

    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    await act(async () => {
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <PrompterControlBar docId={DOC_ID} />
          </ServicesProvider>
        </EnvironmentProvider>,
      );
    });
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // Not operator yet: docked bar does not render
    expect(container.querySelector('[role="toolbar"]')).toBeNull();

    // Claim control via prompterActions
    await act(async () => {
      prompterActions.takeControl(DOC_ID);
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    const bar = container.querySelector<HTMLElement>('[role="toolbar"]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain(PROMPTER_CONTROL_WORDS.play);
    expect(bar?.textContent).toContain(PROMPTER_CONTROL_WORDS.stopControlling);

    // Click Play (data-tour="prompter:play")
    const playBtn = bar?.querySelector<HTMLButtonElement>(
      '[data-tour="prompter:play"]',
    );
    expect(playBtn).not.toBeNull();
    await act(async () => {
      playBtn?.click();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(bar?.textContent).toContain(PROMPTER_CONTROL_WORDS.pause);

    // Option+ArrowUp bumps scroll rate from 3 l/s to 3.5 l/s
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true }),
      );
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(bar?.textContent).toContain(
      PROMPTER_CONTROL_WORDS.linesPerSecond(3.5),
    );

    // Stop controlling hides docked bar and sends release
    const stopBtn = [...(bar?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === PROMPTER_CONTROL_WORDS.stopControlling,
    );
    await act(async () => {
      stopBtn?.click();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    expect(
      requests.some((r) => r.url === "/api/prompter/operator/release"),
    ).toBe(true);
  });

  test("canJumpRowToPrompter allows only sent script rows", () => {
    const sentRow: RundownRowJSON = {
      id: ROW_SENT_ID,
      order: "a0",
      kind: "script",
      docId: "story-1",
      blockId: null,
      unnumbered: false,
      cells: {},
      durationMs: null,
      prompter: {
        state: "on",
        sentAt: NOW,
        sentByUserId: "ana",
        versionId: "v1",
      },
    };
    const unsentRow: RundownRowJSON = {
      ...sentRow,
      id: ROW_UNSENT_ID,
      prompter: null,
    };
    const headerRow: RundownRowJSON = {
      ...sentRow,
      kind: "header",
      docId: null,
    };
    expect(canJumpRowToPrompter(sentRow)).toBe(true);
    expect(canJumpRowToPrompter(unsentRow)).toBe(false);
    expect(canJumpRowToPrompter(headerRow)).toBe(false);
  });
});
