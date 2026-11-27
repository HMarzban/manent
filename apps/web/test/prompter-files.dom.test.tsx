import { withDom } from "@manent/testkit/dom";
import {
  PROMPTER_FILES_WORDS,
  SettingsProvider,
  TimingProvider,
  createValue,
  stateBarLines,
} from "@manent/ui";
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { PrompterFilesHost } from "../src/prompter-files/prompter-files-host.tsx";
import { usePrompterFilesFacts } from "../src/prompter-files/state-facts.ts";
import {
  prompterFilesStore,
  resetPrompterFilesStore,
} from "../src/prompter-files/store.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { writePerson } from "../src/session.ts";
import { fakeHost } from "./desktop.fixtures.ts";
import {
  MemoryStorage,
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const RUNDOWN_ID = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const STORY_ID = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";

let mounted: Root | null = null;

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  resetPrompterFilesStore();
  mock.restore();
  document.body.replaceChildren();
});

function StateBarProbe() {
  const facts = usePrompterFilesFacts();
  const { right } = stateBarLines(facts);
  return <div data-testid="state-probe">{right?.sentence ?? ""}</div>;
}

function mountHost(options: {
  fetchImpl: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  title?: string;
}) {
  const host = fakeHost({ platform: "mac" });
  const environment = testEnvironment({
    desktop: host,
    where: {
      platform: "mac",
      shell: "desktop",
      browser: "Chrome",
      system: "macOS",
    },
    tabStorage: new MemoryStorage(),
  });
  writePerson(environment.tabStorage, {
    token: "node-tok",
    userId: "ana",
    name: "Ana",
  });
  const baseServices = testServices({ userId: "ana", environment });
  const services = {
    ...baseServices,
    library: {
      ...baseServices.library,
      documentTitle: (id: string) =>
        createValue(
          id === RUNDOWN_ID ? (options.title ?? "Tue 17 Nov") : "Story",
        ),
      docKindOf: (id: string) =>
        createValue<"rundown" | "script">(
          id === RUNDOWN_ID ? "rundown" : "script",
        ),
    },
  };
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(options.fetchImpl, { preconnect: fetch.preconnect }),
  );
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  const timing = createClock();
  act(() => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <TimingProvider timing={timing}>
              <PrompterFilesHost />
              <StateBarProbe />
            </TimingProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  return { host, environment, services, container };
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const nextFrame = async (): Promise<void> => {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );
};

const submitBtn = (): HTMLButtonElement =>
  [...document.querySelectorAll("button")].find(
    (b) =>
      b.textContent === PROMPTER_FILES_WORDS.action ||
      b.textContent === "Try again",
  )!;

test("dialog renders S3-PF copy, focuses Cancel, handles Choose…/directory_chosen, refusals, and POST 204", async () => {
  const requests: {
    method: string;
    url: string;
    auth: string | null;
    body: unknown;
  }[] = [];
  let postMode: "busy" | "unreachable" | "other" | "ok" = "busy";
  const { host } = mountHost({
    fetchImpl: async (input, init) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      const auth = new Headers(init?.headers).get("Authorization");
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      requests.push({ method, url, auth, body });
      if (method === "GET") return Response.json(null);
      if (postMode === "busy")
        return Response.json({ error: "busy" }, { status: 409 });
      if (postMode === "unreachable")
        return Response.json({ error: "unreachable" }, { status: 503 });
      if (postMode === "other")
        return Response.json({ error: "bad_request" }, { status: 400 });
      return new Response(null, { status: 204 });
    },
  });
  await flush();

  act(() => prompterFilesStore.open(RUNDOWN_ID));
  await nextFrame();

  // title, body, encoding choices, empty place reason, and initial focus on Cancel
  expect(document.body.textContent).toContain(
    PROMPTER_FILES_WORDS.title("Tue 17 Nov"),
  );
  expect(document.body.textContent).toContain(PROMPTER_FILES_WORDS.body);
  expect(document.body.textContent).toContain(
    PROMPTER_FILES_WORDS.windows1252Help,
  );
  expect(document.body.textContent).toContain(
    "Write prompter files needs a place to write to.",
  );
  expect(
    document.querySelector('[data-tour="prompter_files:place"]'),
  ).not.toBeNull();
  const cancelBtn = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Cancel",
  );
  expect(cancelBtn).toBeDefined();
  expect(document.activeElement?.textContent).toBe("Cancel");
  expect(document.activeElement === cancelBtn).toBe(true);

  // Choose… sends choose_directory; null leaves empty, string fills field
  const chooseBtn = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${PROMPTER_FILES_WORDS.chooseLabel}"]`,
  )!;
  act(() => chooseBtn.click());
  expect(host.sent).toEqual([{ v: 1, t: "choose_directory" }]);

  act(() => host.emit({ v: 1, t: "directory_chosen", path: null }));
  const input = document.querySelector<HTMLInputElement>("input[type='text']")!;
  expect(input.value).toBe("");

  act(() =>
    host.emit({ v: 1, t: "directory_chosen", path: "/Users/ana/Prompter" }),
  );
  expect(input.value).toBe("/Users/ana/Prompter");

  // switch encoding to Windows-1252
  const winRadio = document.querySelector<HTMLElement>(
    '[role="radio"][aria-describedby]',
  )!;
  act(() => winRadio.click());

  // busy refusal
  act(() => submitBtn().click());
  await flush();
  expect(document.body.textContent).toContain(PROMPTER_FILES_WORDS.refusedBusy);

  // unreachable refusal
  postMode = "unreachable";
  act(() => submitBtn().click());
  await flush();
  expect(document.body.textContent).toContain(
    PROMPTER_FILES_WORDS.refusedUnreachable,
  );

  // other refusal
  postMode = "other";
  act(() => submitBtn().click());
  await flush();
  expect(document.body.textContent).toContain(
    PROMPTER_FILES_WORDS.refusedOther,
  );

  // success closes dialog and shows state bar fact
  postMode = "ok";
  act(() => submitBtn().click());
  await flush();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(
    document.querySelector('[data-testid="state-probe"]')?.textContent,
  ).toBe("Writing prompter files to /Users/ana/Prompter");
  expect(requests.at(-1)).toEqual({
    method: "POST",
    url: "/api/local/prompter-files",
    auth: "Bearer node-tok",
    body: {
      rundownId: RUNDOWN_ID,
      folder: "/Users/ana/Prompter",
      encoding: "windows-1252",
    },
  });
});

test("hydrates status, notifies replaced counts as they rise, handles unwritable + reopen, and stops cleanly", async () => {
  const deleted: { auth: string | null }[] = [];
  const { host, environment, services } = mountHost({
    fetchImpl: async (_input, init) => {
      if (init?.method === "DELETE") {
        deleted.push({
          auth: new Headers(init.headers).get("Authorization"),
        });
        return new Response(null, { status: 204 });
      }
      return Response.json({
        rundownId: RUNDOWN_ID,
        path: "/Users/ana/Prompter",
        encoding: "windows-1252",
        replaced: 0,
        failure: null,
      });
    },
  });
  await flush();

  // hydrated state bar
  expect(
    document.querySelector('[data-testid="state-probe"]')?.textContent,
  ).toBe("Writing prompter files to /Users/ana/Prompter");

  // replaced count 0 -> 1 -> 1 (no repeat) -> 12
  act(() =>
    host.emit({
      v: 1,
      t: "prompter_files",
      status: {
        rundownId: RUNDOWN_ID,
        path: "/Users/ana/Prompter",
        encoding: "windows-1252",
        replaced: 1,
        failure: null,
      },
    }),
  );
  expect(services.messages.current()?.text).toBe(
    "Wrote 1 character as ? because Windows-1252 can't hold it.",
  );
  expect(services.messages.current()?.lifetime).toBe("brief");
  services.messages.dismiss(services.messages.current()!.id);

  // same count 1 does not repeat
  act(() =>
    host.emit({
      v: 1,
      t: "prompter_files",
      status: {
        rundownId: RUNDOWN_ID,
        path: "/Users/ana/Prompter",
        encoding: "windows-1252",
        replaced: 1,
        failure: null,
      },
    }),
  );
  expect(services.messages.current()).toBeNull();

  // rises to 12
  act(() =>
    host.emit({
      v: 1,
      t: "prompter_files",
      status: {
        rundownId: RUNDOWN_ID,
        path: "/Users/ana/Prompter",
        encoding: "windows-1252",
        replaced: 12,
        failure: null,
      },
    }),
  );
  expect(services.messages.current()?.text).toBe(
    "Wrote 12 characters as ? because Windows-1252 can't hold them.",
  );
  services.messages.dismiss(services.messages.current()!.id);

  // unwritable clears state bar, pushes until_dismissed with Prompter files… action, and reopens rundown dialog even from a story
  act(() =>
    host.emit({
      v: 1,
      t: "prompter_files",
      status: {
        rundownId: RUNDOWN_ID,
        path: "/Users/ana/Prompter",
        encoding: "windows-1252",
        replaced: 12,
        failure: "unwritable",
      },
    }),
  );
  expect(
    document.querySelector('[data-testid="state-probe"]')?.textContent,
  ).toBe("");
  expect(services.messages.current()).toEqual({
    id: "prompter_files.unwritable",
    text: "Stopped writing prompter files: Manent couldn't write to /Users/ana/Prompter.",
    actions: [{ label: "Prompter files…", commandId: "prompter.reopenFiles" }],
    lifetime: "until_dismissed",
    ownWork: false,
  });
  services.messages.dismiss(services.messages.current()!.id);

  // CommandService runs the S3-PF-18 action cleanly from Library (no open doc) while keeping prompter.files rundown-only
  expect(services.commands.state("prompter.files").visible).toBe(false);
  let runFromLibrary: string | undefined;
  act(() => {
    runFromLibrary = services.commands.run("prompter.reopenFiles", "control");
  });
  expect(runFromLibrary).toBe("ran");
  expect(document.body.textContent).toContain(
    PROMPTER_FILES_WORDS.title("Tue 17 Nov"),
  );
  act(() => prompterFilesStore.close());

  // Also works from a non-rundown script document
  act(() =>
    environment.shellState.set({
      ...environment.shellState.get(),
      screen: "document",
      docId: STORY_ID,
    }),
  );
  expect(services.commands.state("prompter.files").visible).toBe(false);
  let runFromScript: string | undefined;
  act(() => {
    runFromScript = services.commands.run("prompter.reopenFiles", "control");
  });
  expect(runFromScript).toBe("ran");
  expect(document.body.textContent).toContain(
    PROMPTER_FILES_WORDS.title("Tue 17 Nov"),
  );
  act(() => prompterFilesStore.close());

  // stop() sends DELETE and pushes S3-PF-16 brief message once (rapid repeat is idempotent)
  act(() => prompterFilesStore.stop());
  await flush();
  expect(deleted).toEqual([{ auth: "Bearer node-tok" }]);
  expect(services.messages.current()).toEqual({
    id: "prompter_files.stopped",
    text: "Stopped writing prompter files. The files stay in /Users/ana/Prompter.",
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
  services.messages.dismiss(services.messages.current()!.id);
  act(() => prompterFilesStore.stop());
  await flush();
  expect(services.messages.current()).toBeNull();
});
