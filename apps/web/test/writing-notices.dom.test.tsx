import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { SettingsProvider } from "@manent/ui";
import type { Message } from "@manent/ui";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { peopleAnnouncements } from "../src/editor-host/writing-announcer.ts";
import { WritingNotices } from "../src/screens/document/writing-notices.tsx";
import { ServicesProvider } from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { AnnouncerRegion } from "../src/shell/announcer-region.tsx";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import type { EditorFacts } from "../src/state/facts.store.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { testServices } from "./services.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

let roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

/** The test's facts, written when `publish` is called and shown at once, as the next frame would. */
function factsRig() {
  let frame: (() => void) | null = null;
  const store = createFactsStore({
    guard: createGuard({ flavour: "test" }),
    frame: (fn) => {
      frame = fn;
      return () => {};
    },
  });
  return {
    selectors: store.selectors,
    publish(changed: Partial<EditorFacts>) {
      store.writer.publish(changed);
      act(() => frame?.());
    },
  };
}

/** The services of Leo, every message pushed recorded. */
function servicesRig(): { services: PersonServices; pushed: Message[] } {
  const base = testServices({ userId: "leo" });
  const pushed: Message[] = [];
  const services: PersonServices = {
    ...base,
    messages: {
      ...base.messages,
      push(message) {
        pushed.push(message);
        base.messages.push(message);
      },
    },
  };
  return { services, pushed };
}

function render(node: ReactNode): Root {
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  roots.push(root);
  act(() => root.render(node));
  return root;
}

function notices(
  services: PersonServices,
  facts: ReturnType<typeof factsRig>,
): ReactNode {
  return (
    <ServicesProvider services={services}>
      <SettingsProvider store={services.settings}>
        <FactsContext value={facts.selectors}>
          <AnnouncerRegion />
          <WritingNotices docId="d1" />
        </FactsContext>
      </SettingsProvider>
    </ServicesProvider>
  );
}

/** Every text the polite region was given since `watch` began. */
function watchPolite(): () => string[] {
  const region = document.querySelector("[aria-live='polite']");
  if (region === null) throw new TypeError("the polite region is not drawn");
  const observer = new MutationObserver(() => {});
  observer.observe(region, { childList: true });
  return () =>
    observer
      .takeRecords()
      .flatMap((record) => [...record.addedNodes])
      .map((node) => node.textContent ?? "");
}

type People = Parameters<typeof peopleAnnouncements>[2];

const DANA: People[number] = { userId: "dana", name: "Dana Reyes", colour: 1 };
const SAM: People[number] = { userId: "sam", name: "Sam Okafor", colour: 2 };

const NOTICE =
  "'Untitled script' is longer than this device handles comfortably, so typing may slow down.";

test("the notice is shown once per script on this device", () => {
  const { services, pushed } = servicesRig();
  const facts = factsRig();
  const first = render(notices(services, facts));
  facts.publish({ pageCount: 120 });
  facts.publish({ pageCount: 121 });
  facts.publish({ pageCount: 100 });
  facts.publish({ pageCount: 125 });
  act(() => first.unmount());
  render(notices(services, facts));
  facts.publish({ pageCount: 130 });
  expect(
    pushed.map((message) => [message.id, message.text, message.lifetime]),
  ).toEqual([["past_comfort_limit", NOTICE, "until_dismissed"]]);
});

test("a script without pages never gets the notice", () => {
  const { services, pushed } = servicesRig();
  const facts = factsRig();
  render(notices(services, facts));
  facts.publish({ element: "Ink line", pageCount: null });
  expect(pushed).toEqual([]);
});

test("typing that changes no fact announces nothing", () => {
  const { services } = servicesRig();
  const facts = factsRig();
  render(notices(services, facts));
  facts.publish({ element: "Action", page: "1" });
  const said = watchPolite();
  for (let key = 0; key < 20; key++)
    facts.publish({
      element: "Action",
      page: "1",
      canUndo: true,
      selectionEmpty: key % 2 === 0,
    });
  expect(said()).toEqual([]);
});

test("the element at the caret and a page start are said politely as they change", () => {
  const { services } = servicesRig();
  const facts = factsRig();
  render(notices(services, facts));
  facts.publish({ element: "Scene Heading", page: "1" });
  const said = watchPolite();
  facts.publish({ element: "Action" });
  facts.publish({ element: "Dialogue", page: "2" });
  expect(said()).toEqual(["Action", "Dialogue", "Page 2"]);
});

test("the first facts of a script opened after another are not said, nor its page count heard before", () => {
  const { services, pushed } = servicesRig();
  const facts = factsRig();
  facts.publish({ element: "Action", page: "3", pageCount: 130 });
  render(notices(services, facts));
  const said = watchPolite();
  facts.publish({ element: "Dialogue", page: "1" });
  expect([said(), pushed]).toEqual([[], []]);
});

/** A live editor of d1 whose people the test sets. */
function liveRig(): {
  offer(people: People): void;
  leave(): void;
} {
  const listeners = new Set<(people: People) => void>();
  const leave = registerLiveEditor({
    docId: "d1",
    // the people are all this test reads of the editor
    view: {} as LiveEditor["view"],
    scaffold: null,
    presence: {
      publish: () => {},
      subscribe: () => () => {},
      subscribePeople(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    editable: true,
    zoom: () => 1,
  });
  return {
    offer(people) {
      for (const listener of listeners) act(() => listener(people));
    },
    leave,
  };
}

test("people arriving and leaving are said politely when the person chose to hear them", async () => {
  const { services } = servicesRig();
  services.settings.set("writing.announce", "elements_pages_people");
  const live = liveRig();
  render(notices(services, factsRig()));
  // the notices load the editors' registry apart from the frame
  await act(() => import("../src/editor-host/live-editor.ts"));
  const said = watchPolite();
  live.offer([DANA]);
  live.offer([DANA, SAM]);
  live.offer([SAM]);
  live.leave();
  expect(said()).toEqual([
    "Dana Reyes arrived",
    "Sam Okafor arrived",
    "Dana Reyes left",
  ]);
});
