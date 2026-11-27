import { expect, test } from "bun:test";
import type { ImportFile } from "../src/import/open-files.ts";
import { detectInstallHint, isStandalone } from "../src/platform.ts";
import {
  backupEverythingInBrowser,
  buildStoreZip,
} from "../src/pwa/export-all.ts";
import { createInstallStore } from "../src/pwa/install.ts";
import {
  LAUNCH_QUEUE_MAX_BYTES,
  processLaunchFiles,
  registerLaunchQueue,
} from "../src/pwa/launch-queue.ts";
import type {
  LaunchFileHandle,
  LaunchParams,
} from "../src/pwa/launch-queue.ts";
import type { PersonServices, ProjectItem } from "../src/services/ports.ts";

const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const matchQuery = (active: string) => (query: string) => ({
  matches: query === active,
});

test("isStandalone detects standalone, WCO, and iOS navigator.standalone", () => {
  expect([
    isStandalone({
      navigator: { standalone: true },
      matchMedia: matchQuery(""),
    }),
    isStandalone({
      navigator: { standalone: false },
      matchMedia: matchQuery("(display-mode: standalone)"),
    }),
    isStandalone({
      navigator: { standalone: false },
      matchMedia: matchQuery("(display-mode: window-controls-overlay)"),
    }),
    isStandalone({
      navigator: { standalone: false },
      matchMedia: matchQuery(""),
    }),
  ]).toEqual([true, true, true, false]);
});

test("detectInstallHint separates macOS Safari, iOS/iPadOS Safari, and other browsers", () => {
  expect([
    detectInstallHint({ userAgent: SAFARI_MAC, platform: "MacIntel" }),
    detectInstallHint({ userAgent: SAFARI_IOS, platform: "iPhone" }),
    detectInstallHint({
      userAgent: SAFARI_MAC,
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    detectInstallHint({ userAgent: CHROME_IOS, platform: "iPhone" }),
    detectInstallHint({ userAgent: CHROME_MAC, platform: "MacIntel" }),
  ]).toEqual(["macos_safari", "ios_safari", "ios_safari", "none", "none"]);
});

function fakeInstallEvent(
  outcome: "accepted" | "dismissed",
): Event & { readonly prompted: () => number } {
  let calls = 0;
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.defineProperty(event, "prompt", {
    value: async () => {
      calls += 1;
    },
  });
  Object.defineProperty(event, "userChoice", {
    value: Promise.resolve({ outcome }),
  });
  Object.defineProperty(event, "prompted", {
    value: () => calls,
  });
  return event as Event & { readonly prompted: () => number };
}

test("install store captures beforeinstallprompt, prompts once, and hides when standalone or installed", async () => {
  const target = new EventTarget();
  let standalone = false;
  const store = createInstallStore({
    target,
    isStandalone: () => standalone,
  });
  let notifications = 0;
  const stop = store.subscribe(() => {
    notifications += 1;
  });

  expect(store.canInstall()).toBe(false);
  expect(await store.promptInstall()).toBe("unavailable");

  const first = fakeInstallEvent("dismissed");
  target.dispatchEvent(first);
  expect([first.defaultPrevented, store.canInstall(), notifications]).toEqual([
    true,
    true,
    1,
  ]);
  expect(await store.promptInstall()).toBe("dismissed");
  expect([first.prompted(), store.canInstall()]).toEqual([1, false]);

  const second = fakeInstallEvent("accepted");
  target.dispatchEvent(second);
  expect(store.canInstall()).toBe(true);
  standalone = true;
  expect([store.canInstall(), await store.promptInstall()]).toEqual([
    false,
    "unavailable",
  ]);

  standalone = false;
  expect(await store.promptInstall()).toBe("accepted");
  expect(store.canInstall()).toBe(false);

  const third = fakeInstallEvent("accepted");
  target.dispatchEvent(third);
  target.dispatchEvent(new Event("appinstalled"));
  expect(store.canInstall()).toBe(false);

  stop();
  store.dispose();
});

function makeHandle(
  name: string,
  content: Uint8Array,
  overrideSize?: number,
): LaunchFileHandle {
  return {
    kind: "file",
    name,
    async getFile() {
      const file = new File([new Uint8Array(content)], name);
      if (overrideSize !== undefined) {
        Object.defineProperty(file, "size", { value: overrideSize });
      }
      return file;
    },
  };
}

test("launchQueue filters to .fdx/.fountain/.ink and enforces the per-file byte cap", async () => {
  const opened: ImportFile[][] = [];
  const open = async (files: readonly ImportFile[]): Promise<void> => {
    opened.push([...files]);
  };
  const count = await processLaunchFiles(
    [
      makeHandle("pilot.FDX", new TextEncoder().encode("<FinalDraft/>")),
      makeHandle("draft.fountain", new TextEncoder().encode("INT. ROOM - DAY")),
      makeHandle("story.ink", new TextEncoder().encode("=== start ===")),
      makeHandle("notes.txt", new TextEncoder().encode("ignored")),
      makeHandle(
        "huge.fdx",
        new Uint8Array([1, 2, 3]),
        LAUNCH_QUEUE_MAX_BYTES + 1,
      ),
      {
        kind: "directory",
        name: "folder",
        getFile: async () => new File([], "folder"),
      },
    ],
    { open },
  );
  expect(count).toBe(3);
  expect(opened).toHaveLength(1);
  expect(opened[0]!.map((f) => f.name)).toEqual([
    "pilot.FDX",
    "draft.fountain",
    "story.ink",
  ]);
});

test("registerLaunchQueue attaches a consumer and ignores empty launches", async () => {
  const consumers: ((params: LaunchParams) => void | Promise<void>)[] = [];
  const opened: ImportFile[][] = [];
  const ok = registerLaunchQueue({
    launchQueue: {
      setConsumer(consumer) {
        consumers.push(consumer);
      },
    },
    open: async (files) => {
      opened.push([...files]);
    },
  });
  expect(ok).toBe(true);
  expect(registerLaunchQueue({ launchQueue: null })).toBe(false);
  const [consumer] = consumers;
  if (consumer === undefined) throw new Error("expected consumer");
  await consumer({ files: [] });
  expect(opened).toHaveLength(0);
  await consumer({
    files: [
      makeHandle("scene.fountain", new TextEncoder().encode("INT. CAFE")),
    ],
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(opened.map((batch) => batch.map((f) => f.name))).toEqual([
    ["scene.fountain"],
  ]);
});

test("buildStoreZip writes valid ZIP headers and backupEverythingInBrowser bundles cached projects offline", async () => {
  const sample = new TextEncoder().encode("hello");
  const rawZip = buildStoreZip(
    [{ name: "a.txt", bytes: sample }],
    Date.UTC(2026, 10, 12),
  );
  const view = new DataView(rawZip.buffer);
  // local file header signature PK\x03\x04 and end-of-central-directory PK\x05\x06
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  expect(view.getUint32(rawZip.byteLength - 22, true)).toBe(0x06054b50);

  const projects: ProjectItem[] = [
    {
      projectId: "p1",
      title: "Pilot",
      kind: "film",
      firstDocId: "d1",
      lastEdited: { byName: "Leo", at: 1000 },
      place: { kind: "synced" },
    },
    {
      projectId: "p2",
      title: "Remote Only",
      kind: "film",
      firstDocId: "d2",
      lastEdited: { byName: "Leo", at: 1000 },
      place: { kind: "not_on_device" },
    },
    {
      projectId: "p3",
      title: "Pilot",
      kind: "film",
      firstDocId: "d3",
      lastEdited: { byName: "Leo", at: 1000 },
      place: { kind: "waiting", count: 2 },
    },
  ];
  const services = {
    userId: "leo",
    api: {
      me: async () => ({ ok: false as const, reason: "unreachable" as const }),
    },
    library: {
      readProjects: async () => projects,
    },
  } as unknown as PersonServices;
  const downloads: { name: string; type: string; bytes: Uint8Array }[] = [];
  const counts: number[] = [];
  const outcome = await backupEverythingInBrowser({
    services,
    now: () => new Date(2026, 10, 12, 10, 30).getTime(),
    onCount: (n) => counts.push(n),
    writeProject: async (_s, docId) => ({
      name: "Pilot.zip",
      bytes: new TextEncoder().encode(`archive-${docId}`),
    }),
    download: (bytes, name, type) => downloads.push({ bytes, name, type }),
  });
  expect(counts).toEqual([2]);
  expect(outcome).toEqual({
    kind: "exported",
    count: 2,
    name: "Manent export 12 Nov 2026.zip",
  });
  expect(downloads).toHaveLength(1);
  expect(downloads[0]!.type).toBe("application/zip");
  const text = new TextDecoder().decode(downloads[0]!.bytes);
  expect(text).toContain("manifest.json");
  expect(text).toContain("Pilot.zip");
  expect(text).toContain("Pilot (2).zip");
  expect(text).toContain("archive-d1");
  expect(text).toContain("archive-d3");
  expect(text).not.toContain("archive-d2");
});
