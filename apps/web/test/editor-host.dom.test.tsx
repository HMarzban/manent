import { withDom } from "@manent/testkit/dom";
import { expect, jest, test } from "bun:test";
import { Profiler, act, useState } from "react";
import type { ProfilerOnRenderCallback, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EditorHost } from "../src/editor-host/editor-host.tsx";
import type {
  EditorMount,
  SettingsReaderPort,
} from "../src/editor-host/mount.ts";
import { placeholderMount } from "../src/editor-host/placeholder-mount.ts";
import { standInMount } from "../src/editor-host/stand-in-mount.ts";
import { FactsContext, OutlineContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore, useEditorFact } from "../src/state/facts.store.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import type { Guard } from "../src/state/guard.ts";
import {
  createOutlineStore,
  useOutlineCount,
} from "../src/state/outline.store.ts";
import { usePanel } from "../src/state/panels.store.ts";

withDom();

/** Frames that pass only when a keystroke has been handled. */
let pendingFrames: (() => void)[] = [];
const frames = {
  request(fn: () => void): () => void {
    pendingFrames.push(fn);
    return () => {
      pendingFrames = pendingFrames.filter((f) => f !== fn);
    };
  },
  run(): void {
    const due = pendingFrames;
    pendingFrames = [];
    for (const fn of due) fn();
  },
};

const settings: SettingsReaderPort = {
  get: () => null,
  subscribe: () => () => {},
};
const ignoreRender: ProfilerOnRenderCallback = () => {};

function ElementReadout() {
  return <output data-readout="">{useEditorFact("element")}</output>;
}

function SidePanel() {
  const { tab, widthPx } = usePanel("side");
  return <aside data-tab={tab ?? ""} data-width={widthPx} />;
}

function OutlineList() {
  return <ol data-count={useOutlineCount()} />;
}

/** The host, a status readout, a panel and a list, each in its own Profiler. */
function FrameUnderTest(props: {
  guard: Guard;
  mount: EditorMount;
  docId?: string;
  covered?: boolean;
  onRender?: ProfilerOnRenderCallback;
}) {
  const [stores] = useState(() => ({
    facts: createFactsStore({ guard: props.guard, frame: frames.request }),
    outline: createOutlineStore({
      guard: props.guard,
      schedule: () => () => {},
      composing: () => false,
    }),
  }));
  const onRender = props.onRender ?? ignoreRender;
  return (
    <FactsContext value={stores.facts.selectors}>
      <OutlineContext value={stores.outline.selectors}>
        <Profiler id="host" onRender={onRender}>
          <EditorHost
            docId={props.docId ?? "doc-1"}
            covered={props.covered ?? false}
            mount={props.mount}
            ports={{
              facts: stores.facts.writer,
              outline: stores.outline.writer,
              settings,
              guard: props.guard,
            }}
          />
        </Profiler>
        <Profiler id="element" onRender={onRender}>
          <ElementReadout />
        </Profiler>
        <Profiler id="panel" onRender={onRender}>
          <SidePanel />
        </Profiler>
        <Profiler id="outline" onRender={onRender}>
          <OutlineList />
        </Profiler>
      </OutlineContext>
    </FactsContext>
  );
}

function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const find = (selector: string): HTMLElement => {
    const found = container.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
  };
  return {
    find,
    get textbox() {
      return find('[role="textbox"]');
    },
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  };
}

/** One keystroke as the browser reports it to a contenteditable, then the next frame. */
function typeInto(textbox: HTMLElement, ch: string): void {
  const enter = ch === "\n";
  if (!enter) textbox.append(ch);
  textbox.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: enter ? "insertParagraph" : "insertText",
      data: enter ? null : ch,
    }),
  );
  frames.run();
}

const testGuard = (): Guard => {
  const guard = createGuard({ flavour: "test" });
  bindGuard(guard);
  return guard;
};

test("typing in the stand-in causes no React commit and no interface-store write", async () => {
  const commits: string[] = [];
  const guard = testGuard();
  const app = render(
    <Profiler id="frame" onRender={(id) => commits.push(id)}>
      <FrameUnderTest guard={guard} mount={standInMount} />
    </Profiler>,
  );
  await act(() => typeInto(app.textbox, "a")); // warm-up: may publish facts once
  commits.length = 0;
  for (const ch of "INT. KITCHEN - NIGHT and more words")
    await act(() => typeInto(app.textbox, ch));
  expect([commits, guard.violations()]).toEqual([[], 0]);
  app.unmount();
});

test("a keystroke that changes a fact re-renders only the component that reads it", async () => {
  const commits: string[] = [];
  const app = render(
    <FrameUnderTest
      guard={testGuard()}
      mount={standInMount}
      onRender={(id) => commits.push(id)}
    />,
  );
  await act(() => typeInto(app.textbox, "a"));
  const before = app.find("[data-readout]").textContent;
  commits.length = 0;
  await act(() => typeInto(app.textbox, "\n"));
  expect([before, commits, app.find("[data-readout]").textContent]).toEqual([
    "scene_heading",
    ["element"],
    "action",
  ]);
  app.unmount();
});

test("the host is mounted once and covered, never unmounted, by a screen over it", async () => {
  const mounts: string[] = [];
  const counting: EditorMount = {
    mount(options) {
      mounts.push(`mount ${options.docId}`);
      const dispose = standInMount.mount(options);
      return () => {
        mounts.push(`dispose ${options.docId}`);
        dispose();
      };
    },
  };
  const guard = testGuard();
  const frame = (covered: boolean) => (
    <FrameUnderTest guard={guard} mount={counting} covered={covered} />
  );
  const app = render(frame(false));
  await act(() => typeInto(app.textbox, "x"));
  const host = app.find("[data-editor-host]");
  app.rerender(frame(true));
  const covered = [host.style.visibility, host.hasAttribute("inert")];
  app.rerender(frame(false));
  expect([
    mounts,
    covered,
    [host.style.visibility, host.hasAttribute("inert")],
    app.textbox.textContent,
  ]).toEqual([["mount doc-1"], ["hidden", true], ["", false], "x"]);
  app.unmount();
  expect(mounts).toEqual(["mount doc-1", "dispose doc-1"]);
});

test("a new document is mounted after the last one is disposed", () => {
  const mounts: string[] = [];
  const counting: EditorMount = {
    mount(options) {
      mounts.push(`mount ${options.docId}`);
      return () => mounts.push(`dispose ${options.docId}`);
    },
  };
  const guard = testGuard();
  const app = render(
    <FrameUnderTest guard={guard} mount={counting} docId="doc-1" />,
  );
  app.rerender(<FrameUnderTest guard={guard} mount={counting} docId="doc-2" />);
  expect(mounts).toEqual(["mount doc-1", "dispose doc-1", "mount doc-2"]);
  app.unmount();
});

test("the placeholder's sheet is inside the pages, so White page in dark theme reaches it", () => {
  const app = render(
    <FrameUnderTest guard={testGuard()} mount={placeholderMount} />,
  );
  expect(app.find(".mn-sheet").parentElement?.className).toBe("mn-pages");
  app.unmount();
});

test("the placeholder says Opening… only after 150 ms", () => {
  jest.useFakeTimers();
  const app = render(
    <FrameUnderTest guard={testGuard()} mount={placeholderMount} />,
  );
  const sheet = app.find("[data-placeholder]");
  const status = () => app.find('[role="status"]').textContent;
  const before = status();
  act(() => jest.advanceTimersByTime(149));
  const at149 = status();
  act(() => jest.advanceTimersByTime(1));
  expect([
    sheet.style.width,
    sheet.style.height,
    sheet.getAttribute("aria-hidden"),
    sheet.textContent,
    before,
    at149,
    status(),
    app.find("[data-readout]").textContent,
  ]).toEqual(["816px", "1056px", "true", "", "", "", "Opening…", ""]);
  app.unmount();
  jest.useRealTimers();
});
