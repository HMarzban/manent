import { withDom } from "@manent/testkit/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ASSET_MAX_BYTES,
  AssetValidationError,
  computeSha256Hex,
  openIdbAssetStore,
  validateLocalAssetBytes,
} from "@manent/client-web";
import type { StagedAsset } from "@manent/client-web";
import { COMMANDS, ELEMENT_COMMAND_SLOTS } from "@manent/commands";
import type { CommandContext } from "@manent/commands";
import { writeArchive } from "@manent/formats";
import type { ArchiveDocument } from "@manent/formats";
import { ENGINE_VERSION, engineFor, profileFor } from "@manent/pagination";
import type { GraphicAttrs } from "@manent/schema";
import { GRAPHICS_WORDS, createMessageQueue } from "@manent/ui";
import { IDBFactory } from "fake-indexeddb";
import {
  handleDroppedOrPastedImages,
  registerGraphicController,
  syncSelectedGraphic,
} from "../src/editor-host/graphics-bridge.ts";
import { GraphicDetailsSection } from "../src/graphics/graphic-details-section.tsx";
import {
  insertChyron,
  insertImageFromPicker,
  reportGraphicQuotaRefusal,
} from "../src/graphics/insert-graphic.ts";
import { transcodeWebpToPng } from "../src/graphics/webp-to-png.ts";
import { DETAILS_SECTIONS } from "../src/screens/document/details-sections.ts";
import { collectArchiveAssets } from "../src/send/archive-assets.ts";
import {
  collectPdfAssets,
  pdfAssetReaderFromStore,
} from "../src/send/pdf-assets.ts";
import { ServicesProvider } from "../src/services/context.tsx";
import type { PersonServices, ProjectKind } from "../src/services/ports.ts";

withDom();

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
  document.body.innerHTML = "";
});

function mountNode(node: ReactNode): {
  container: HTMLElement;
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const unmount = (): void => {
    act(() => root.unmount());
    container.remove();
  };
  cleanups.push(unmount);
  return { container, unmount };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

function makePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes[11] = 13;
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function makeWebp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  new Uint8Array(bytes).buffer;

const BASE_CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: true,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: false,
  signedIn: true,
  workspace: "writable",
  panelOpen: { left: false, side: false },
  historyPresent: false,
  format: "screenplay",
  rulerShown: false,
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  production: null,
  docKind: "script",
  projectKind: "film",
  outlineStart: false,
  writing: null,
  material: null,
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: false,
  focusMode: false,
  readingAloud: false,
  sprintRunning: false,
};

function subscribable<T>(value: T) {
  return {
    get: () => value,
    subscribe: () => () => {},
  };
}

function fakeServices(options: {
  projectKind: ProjectKind;
  format?: string;
  access?: "edit" | "view";
}): PersonServices {
  const messages = createMessageQueue({
    now: () => 0,
    schedule: () => () => {},
  });
  const access = options.access ?? "edit";
  return {
    userId: "user-1",
    messages,
    library: {
      documentKind: () => subscribable(options.projectKind),
      documentProject: () => subscribable("proj-1"),
    },
    documents: {
      open: () => ({
        status: subscribable({ access }),
      }),
      close() {},
    },
    openScriptStore: () => ({
      get: (key: string) =>
        key === "script.format" ? (options.format ?? "screenplay") : undefined,
      subscribe: () => () => {},
    }),
  } as unknown as PersonServices;
}

const byId = (id: string) => COMMANDS.find((c) => c.id === id)!;

async function stageLocal(bytes: Uint8Array): Promise<StagedAsset> {
  const valid = validateLocalAssetBytes(bytes);
  const assetId = await computeSha256Hex(bytes);
  return { ...valid, assetId, url: `blob:test/${assetId}` };
}

function inputForLabel(root: HTMLElement, text: string): HTMLInputElement {
  const label = [...root.querySelectorAll("label")].find(
    (el) => el.textContent === text,
  )!;
  return root.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`)!;
}

describe("graphics commands and Element picker exclusion", () => {
  test("Insert image has no ellipsis and opens null; chyrons are Show/News/Variety only", () => {
    const insertImg = byId("graphics.insertImage");
    const lowerThird = byId("graphics.insertLowerThird");
    const ots = byId("graphics.insertOts");
    const fullScreen = byId("graphics.insertFullScreen");

    expect([insertImg.label, insertImg.opens]).toEqual(["Insert image", null]);
    expect([lowerThird.label, ots.label, fullScreen.label]).toEqual([
      "Insert lower third",
      "Insert over the shoulder",
      "Insert full screen",
    ]);
    expect([lowerThird.opens, ots.opens, fullScreen.opens]).toEqual([
      null,
      null,
      null,
    ]);

    // Film sees ONLY Insert image, never chyrons.
    expect(insertImg.visible!(BASE_CTX)).toBe(true);
    expect(lowerThird.visible!(BASE_CTX)).toBe(false);
    expect(ots.visible!(BASE_CTX)).toBe(false);
    expect(fullScreen.visible!(BASE_CTX)).toBe(false);

    // Show, News and Variety see all 4 commands.
    for (const ctx of [
      { ...BASE_CTX, projectKind: "show" as const },
      { ...BASE_CTX, projectKind: "news" as const },
      { ...BASE_CTX, projectKind: "film" as const, format: "variety" as const },
    ]) {
      expect(insertImg.visible!(ctx)).toBe(true);
      expect(lowerThird.visible!(ctx)).toBe(true);
      expect(ots.visible!(ctx)).toBe(true);
      expect(fullScreen.visible!(ctx)).toBe(true);
    }

    // Viewers and Ink scripts never see graphic insert commands.
    expect(insertImg.visible!({ ...BASE_CTX, role: "viewer" })).toBe(false);
    expect(insertImg.visible!({ ...BASE_CTX, format: "ink" })).toBe(false);
  });

  test("graphic is excluded from Element picker slots and element commands", () => {
    expect(Object.keys(ELEMENT_COMMAND_SLOTS).join(",")).not.toContain(
      "graphic",
    );
    const elementCommands = COMMANDS.filter((c) => c.id.startsWith("element."));
    expect(elementCommands.some((c) => c.id.includes("graphic"))).toBe(false);
    expect(
      elementCommands.some(
        (c) =>
          typeof c.label === "string" && c.label === GRAPHICS_WORDS.graphic,
      ),
    ).toBe(false);
  });
});

describe("zero-dialog insertion and drop/paste validation refusals", () => {
  test("picker and drop/paste stage valid PNGs and emit exact MessageSlot refusals for invalid files", async () => {
    const docId = "doc-drop";
    const inserted: unknown[] = [];
    const unregister = registerGraphicController(docId, {
      insertGraphic(input) {
        inserted.push(input);
        return true;
      },
      updateGraphicAttrs: () => true,
      setGraphicHeightLines: () => true,
      removeGraphicImage: () => true,
      selectedGraphic: () => null,
    });
    cleanups.push(unregister);

    const services = fakeServices({ projectKind: "show" });

    const png = makePng(640, 360);
    const pngId = await computeSha256Hex(png);
    const ok = await insertImageFromPicker(services, docId, {
      pickFile: async () => ({
        type: "image/png",
        arrayBuffer: async () => toBuffer(png),
      }),
      stage: stageLocal,
    });
    expect(ok).toBe(true);
    expect(inserted).toEqual([
      {
        kind: "image",
        assetId: pngId,
        heightLines: 8,
        aspectWidth: 640,
        aspectHeight: 360,
      },
    ]);

    // 1-click chyron insertion with zero dialog.
    expect(insertChyron(docId, "lower_third")).toBe(true);
    expect(inserted[1]).toEqual({
      kind: "lower_third",
      assetId: null,
      heightLines: 4,
    });

    // Drop/paste refusals: unsupported type, >5 MB, >4,096 px, and 200 MB quota.
    const svg = new TextEncoder().encode("<svg/>");
    const huge = new Uint8Array(ASSET_MAX_BYTES + 1);
    huge.set(makePng(10, 10), 0);
    const wide = makePng(5000, 100);

    const count = await handleDroppedOrPastedImages(
      [
        { type: "image/svg+xml", arrayBuffer: async () => toBuffer(svg) },
        { type: "image/png", arrayBuffer: async () => toBuffer(huge) },
        { type: "image/png", arrayBuffer: async () => toBuffer(wide) },
      ],
      { docId, messages: services.messages, stage: stageLocal },
    );
    expect(count).toBe(0);

    const seen: string[] = [];
    for (
      let current = services.messages.current();
      current !== null;
      current = services.messages.current()
    ) {
      seen.push(current.text);
      services.messages.dismiss(current.id);
    }
    expect(seen).toEqual([
      GRAPHICS_WORDS.refusals.unsupportedType,
      GRAPHICS_WORDS.refusals.tooLarge,
      GRAPHICS_WORDS.refusals.dimensionsExceeded,
    ]);

    reportGraphicQuotaRefusal(services);
    expect(services.messages.current()?.text).toBe(
      GRAPHICS_WORDS.refusals.quotaExceeded,
    );
    expect(new AssetValidationError("too_large", "x").reason).toBe("too_large");
  });
});

describe("Details → Selection → Graphic", () => {
  test("registered in DETAILS_SECTIONS under selection and edits Kind/Height/Image/Cue/Description without caption field", () => {
    expect(
      DETAILS_SECTIONS.some(
        (section) => section.id === "graphic" && section.scope === "selection",
      ),
    ).toBe(true);

    const docId = "doc-details";
    let current: GraphicAttrs = {
      kind: "lower_third",
      assetId: "a".repeat(64),
      heightLines: 6,
      label: "Cue 1",
      alt: "Studio desk",
      aspectWidth: 1920,
      aspectHeight: 1080,
    };

    const unregister = registerGraphicController(docId, {
      insertGraphic: () => true,
      updateGraphicAttrs(patch) {
        current = { ...current, ...patch };
        syncSelectedGraphic(docId);
        return true;
      },
      setGraphicHeightLines(heightLines) {
        current = { ...current, heightLines };
        syncSelectedGraphic(docId);
        return true;
      },
      removeGraphicImage() {
        current = {
          ...current,
          assetId: null,
          aspectWidth: null,
          aspectHeight: null,
        };
        syncSelectedGraphic(docId);
        return true;
      },
      selectedGraphic: () => ({ blockId: "g1", attrs: current }),
    });
    cleanups.push(unregister);

    const showView = mountNode(
      <ServicesProvider services={fakeServices({ projectKind: "show" })}>
        <GraphicDetailsSection docId={docId} />
      </ServicesProvider>,
    );

    const section = showView.container.querySelector(
      '[data-tour="details:graphic"]',
    );
    expect(section).not.toBeNull();
    expect(showView.container.textContent).toContain(
      GRAPHICS_WORDS.kinds.lower_third,
    );
    expect(showView.container.textContent).toContain(
      GRAPHICS_WORDS.replaceImage,
    );
    expect(showView.container.textContent).toContain(
      GRAPHICS_WORDS.removeImage,
    );

    // Step height spinbutton up via ArrowUp.
    const spin = showView.container.querySelector<HTMLInputElement>(
      '[role="spinbutton"]',
    )!;
    expect(spin.getAttribute("aria-valuenow")).toBe("6");
    act(() => {
      spin.focus();
      spin.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(current.heightLines).toBe(7);

    // Update Cue tag and Description via label lookup.
    const cueInput = inputForLabel(showView.container, GRAPHICS_WORDS.cueTag);
    act(() => {
      cueInput.focus();
      setInputValue(cueInput, "Cue 9");
    });
    act(() => {
      cueInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(current.label).toBe("Cue 9");

    const descInput = inputForLabel(
      showView.container,
      GRAPHICS_WORDS.description,
    );
    act(() => {
      descInput.focus();
      setInputValue(descInput, "Host lower third");
    });
    act(() => {
      descInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(current.alt).toBe("Host lower third");

    // Click Remove image and verify button swaps to Choose image….
    const removeBtn = [...showView.container.querySelectorAll("button")].find(
      (btn) => btn.textContent === GRAPHICS_WORDS.removeImage,
    )!;
    act(() => {
      removeBtn.click();
    });
    expect(current.assetId).toBeNull();
    expect(showView.container.textContent).toContain(
      GRAPHICS_WORDS.chooseImage,
    );

    // Film project hides Kind Segmented control.
    const filmView = mountNode(
      <ServicesProvider services={fakeServices({ projectKind: "film" })}>
        <GraphicDetailsSection docId={docId} />
      </ServicesProvider>,
    );
    expect(filmView.container.textContent).not.toContain(
      GRAPHICS_WORDS.kinds.lower_third,
    );
    expect(
      filmView.container.querySelector('[role="spinbutton"]'),
    ).not.toBeNull();
  });
});

describe("WebP → PNG transcoding, PDF assets and Archive asset bundling", () => {
  test("transcodeWebpToPng converts WebP and collectPdfAssets / collectArchiveAssets bundle project assets", async () => {
    const store = await openIdbAssetStore({
      userId: "user-export",
      indexedDb: new IDBFactory(),
    });
    const pngBytes = makePng(100, 80);
    const pngId = await computeSha256Hex(pngBytes);
    const webpBytes = makeWebp(120, 90);
    const webpId = await computeSha256Hex(webpBytes);
    const missingId = "0".repeat(64);

    await store.putUploadedAsset({
      assetId: pngId,
      projectId: "proj-exp",
      mime: "image/png",
      width: 100,
      height: 80,
      bytes: pngBytes,
    });
    await store.putUploadedAsset({
      assetId: webpId,
      projectId: "proj-exp",
      mime: "image/webp",
      width: 120,
      height: 90,
      bytes: webpBytes,
    });

    const transcoded = await transcodeWebpToPng(webpBytes, {
      decode: async () => ({ width: 120, height: 90 }),
      encodePng: async () => pngBytes,
    });
    expect(transcoded).toEqual(pngBytes);
    expect(
      await transcodeWebpToPng(webpBytes, {
        decode: async () => {
          throw new Error("no codec");
        },
      }),
    ).toBeNull();

    const engine = engineFor(ENGINE_VERSION)!;
    const pagination = engine.paginate(
      [
        {
          id: "g1",
          type: "graphic",
          kind: null,
          text: "PNG graphic",
          styles: null,
          dual: null,
          num: null,
          align: null,
          indent: null,
          width: null,
          spaceBefore: null,
          noContd: false,
          graphic: {
            kind: "image",
            assetId: pngId,
            heightLines: 6,
            label: "",
            alt: "",
            aspectWidth: 100,
            aspectHeight: 80,
          },
        },
        {
          id: "g2",
          type: "graphic",
          kind: null,
          text: "WebP graphic",
          styles: null,
          dual: null,
          num: null,
          align: null,
          indent: null,
          width: null,
          spaceBefore: null,
          noContd: false,
          graphic: {
            kind: "image",
            assetId: webpId,
            heightLines: 6,
            label: "",
            alt: "",
            aspectWidth: 120,
            aspectHeight: 90,
          },
        },
        {
          id: "g3",
          type: "graphic",
          kind: null,
          text: "Offline graphic",
          styles: null,
          dual: null,
          num: null,
          align: null,
          indent: null,
          width: null,
          spaceBefore: null,
          noContd: false,
          graphic: {
            kind: "image",
            assetId: missingId,
            heightLines: 6,
            label: "",
            alt: "",
            aspectWidth: null,
            aspectHeight: null,
          },
        },
      ],
      profileFor("screenplay")!,
    );

    const pdfAssets = await collectPdfAssets(
      pagination,
      pdfAssetReaderFromStore(store),
      {
        decode: async () => ({ width: 120, height: 90 }),
        encodePng: async () => pngBytes,
      },
    );
    expect(pdfAssets.get(pngId)?.mime).toBe("image/png");
    expect(pdfAssets.get(webpId)?.mime).toBe("image/png");
    expect(pdfAssets.has(missingId)).toBe(false);

    const docs: ArchiveDocument[] = [
      {
        docId: "d1",
        script: {
          title: "Episode 1",
          format: "screenplay",
          blocks: [
            {
              type: "block",
              attrs: {
                id: "b1",
                type: "graphic",
                graphic: {
                  kind: "image",
                  assetId: pngId,
                  heightLines: 6,
                  label: "",
                  alt: "",
                  aspectWidth: 100,
                  aspectHeight: 80,
                },
              },
            },
            {
              type: "block",
              attrs: {
                id: "b2",
                type: "graphic",
                graphic: {
                  kind: "image",
                  assetId: webpId,
                  heightLines: 6,
                  label: "",
                  alt: "",
                  aspectWidth: 120,
                  aspectHeight: 90,
                },
              },
            },
          ],
          notes: [],
          record: null,
          production: null,
        },
        drafts: [],
      },
    ];
    const archiveAssets = await collectArchiveAssets(
      docs,
      pdfAssetReaderFromStore(store),
    );
    expect(archiveAssets.map((a) => a.mime).toSorted()).toEqual([
      "image/png",
      "image/webp",
    ]);

    const zip = writeArchive({
      project: "Show",
      exportedAt: 1_700_000_000_000,
      documents: docs,
      assets: archiveAssets,
    });
    const zipText = new TextDecoder("latin1").decode(zip);
    expect(zipText).toContain(`assets/${pngId}.png`);
    expect(zipText).toContain(`assets/${webpId}.webp`);

    await store.close();
  });
});
