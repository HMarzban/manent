// Editor-host bridge for inline graphics: per-doc command hooks, selected graphic state,
// drag-drop/paste image staging, and per-project AssetUploader lifecycle.
import {
  AssetValidationError,
  createAssetUploader,
  openIdbAssetStore,
} from "@manent/client-web";
import type {
  AssetUploader,
  AssetValidationReason,
  IdbAssetStore,
  StagedAsset,
} from "@manent/client-web";
import type {
  GraphicAssetPort,
  InsertGraphicInput,
  ScriptEditor,
  UpdateGraphicAttrsPatch,
} from "@manent/editor";
import type { GraphicAttrs, GraphicKind } from "@manent/schema";
import { GRAPHICS_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { browserStores } from "../services/sync/device-memory.ts";

export interface SelectedGraphicSnapshot {
  readonly blockId: string;
  readonly attrs: GraphicAttrs;
}

export interface GraphicController {
  insertGraphic(input?: InsertGraphicInput): boolean;
  updateGraphicAttrs(patch: UpdateGraphicAttrsPatch, blockId?: string): boolean;
  setGraphicHeightLines(heightLines: number, blockId?: string): boolean;
  removeGraphicImage(blockId?: string): boolean;
  selectedGraphic(): SelectedGraphicSnapshot | null;
}

const controllers = new Map<string, GraphicController>();
const snapshots = new Map<string, SelectedGraphicSnapshot | null>();
const listeners = new Map<string, Set<() => void>>();

const notifySelected = (docId: string): void => {
  for (const listener of listeners.get(docId) ?? []) listener();
};

function sameGraphic(
  a: SelectedGraphicSnapshot | null,
  b: SelectedGraphicSnapshot | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.blockId === b.blockId &&
    a.attrs.kind === b.attrs.kind &&
    a.attrs.assetId === b.attrs.assetId &&
    a.attrs.heightLines === b.attrs.heightLines &&
    a.attrs.label === b.attrs.label &&
    a.attrs.alt === b.attrs.alt &&
    a.attrs.aspectWidth === b.attrs.aspectWidth &&
    a.attrs.aspectHeight === b.attrs.aspectHeight
  );
}

/** Current selected graphic block for `docId`, or null when the caret is elsewhere. */
export const getSelectedGraphic = (
  docId: string,
): SelectedGraphicSnapshot | null => snapshots.get(docId) ?? null;

/** Subscribes to changes in the selected graphic block for `docId`. */
export function subscribeSelectedGraphic(
  docId: string,
  listener: () => void,
): () => void {
  const set = listeners.get(docId) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(docId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(docId);
  };
}

/** Registers a graphic controller (used by editor mount and DOM tests); returns unregister. */
export function registerGraphicController(
  docId: string,
  controller: GraphicController,
): () => void {
  controllers.set(docId, controller);
  snapshots.set(docId, controller.selectedGraphic());
  notifySelected(docId);
  return () => {
    if (controllers.get(docId) !== controller) return;
    controllers.delete(docId);
    snapshots.delete(docId);
    notifySelected(docId);
  };
}

/** Refreshes the published snapshot for `docId` after an editor state update. */
export function syncSelectedGraphic(docId: string): void {
  const next = controllers.get(docId)?.selectedGraphic() ?? null;
  if (sameGraphic(snapshots.get(docId) ?? null, next)) return;
  snapshots.set(docId, next);
  notifySelected(docId);
}

function runAndSync(
  docId: string,
  fn: (c: GraphicController) => boolean,
): boolean {
  const controller = controllers.get(docId);
  const ok = controller ? fn(controller) : false;
  if (ok) syncSelectedGraphic(docId);
  return ok;
}

export const runGraphicInsert = (
  docId: string,
  input?: InsertGraphicInput,
): boolean => runAndSync(docId, (c) => c.insertGraphic(input));

export const runGraphicUpdate = (
  docId: string,
  patch: UpdateGraphicAttrsPatch,
  blockId?: string,
): boolean => runAndSync(docId, (c) => c.updateGraphicAttrs(patch, blockId));

export const runGraphicHeight = (
  docId: string,
  heightLines: number,
  blockId?: string,
): boolean =>
  runAndSync(docId, (c) => c.setGraphicHeightLines(heightLines, blockId));

export const runGraphicRemoveImage = (
  docId: string,
  blockId?: string,
): boolean => runAndSync(docId, (c) => c.removeGraphicImage(blockId));

/** Maps a local validation failure or server quota refusal to the verified copy in `GRAPHICS_WORDS`. */
export function graphicRefusalText(
  reason: AssetValidationReason | "quota_exceeded",
): string {
  switch (reason) {
    case "too_large":
      return GRAPHICS_WORDS.refusals.tooLarge;
    case "dimensions_exceeded":
      return GRAPHICS_WORDS.refusals.dimensionsExceeded;
    case "quota_exceeded":
      return GRAPHICS_WORDS.refusals.quotaExceeded;
    case "empty":
    case "unsupported_type":
    case "invalid_header":
      return GRAPHICS_WORDS.refusals.unsupportedType;
  }
}

export function pushGraphicRefusal(
  messages: MessageQueue,
  reason: AssetValidationReason | "quota_exceeded",
): void {
  messages.push({
    id: `graphic:${reason}`,
    text: graphicRefusalText(reason),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
}

interface PooledUploader {
  readonly uploader: AssetUploader;
  readonly store: IdbAssetStore;
  readonly stopOnline: () => void;
}

const uploaderPool = new Map<string, Promise<PooledUploader | null>>();

export function getProjectAssetUploader(
  services: { readonly userId: string; readonly messages?: MessageQueue },
  projectId: string,
): Promise<PooledUploader | null> {
  const key = `${services.userId}:${projectId}`;
  const existing = uploaderPool.get(key);
  if (existing !== undefined) return existing;
  const created = (async (): Promise<PooledUploader | null> => {
    const indexedDb = browserStores().indexedDb;
    if (indexedDb === null) return null;
    const store = await openIdbAssetStore({
      userId: services.userId,
      indexedDb,
    });
    const uploader = createAssetUploader({
      projectId,
      store,
      onUploadRefused(_assetId, status) {
        if (status === 413 && services.messages)
          pushGraphicRefusal(services.messages, "quota_exceeded");
      },
    });
    const onOnline = (): void => {
      void uploader.notifyOnline();
    };
    if (typeof window !== "undefined")
      window.addEventListener("online", onOnline);
    return {
      uploader,
      store,
      stopOnline: () => {
        if (typeof window !== "undefined")
          window.removeEventListener("online", onOnline);
      },
    };
  })().catch(() => {
    uploaderPool.delete(key);
    return null;
  });
  uploaderPool.set(key, created);
  return created;
}

export function graphicAssetPortFor(
  services: Pick<PersonServices, "userId" | "messages" | "library">,
  docId: string,
): GraphicAssetPort {
  return {
    async resolveUrl(assetId) {
      const projectId = services.library.documentProject(docId).get() ?? docId;
      const pooled = await getProjectAssetUploader(services, projectId);
      return pooled === null ? null : pooled.uploader.resolveAssetUrl(assetId);
    },
  };
}

/** Stages bytes into the project's uploader, pushing a MessageSlot refusal if validation fails. */
export async function stageGraphicBytes(
  bytes: Uint8Array,
  deps: {
    readonly stage: (data: Uint8Array) => Promise<StagedAsset>;
    readonly messages: MessageQueue;
  },
): Promise<StagedAsset | null> {
  try {
    return await deps.stage(bytes);
  } catch (caught) {
    pushGraphicRefusal(
      deps.messages,
      caught instanceof AssetValidationError
        ? caught.reason
        : "unsupported_type",
    );
    return null;
  }
}

/** Handles dropped or pasted image files, staging each valid image and inserting a `"graphic"` block. */
export async function handleDroppedOrPastedImages(
  files: readonly {
    readonly type: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  }[],
  deps: {
    readonly docId: string;
    readonly messages: MessageQueue;
    readonly stage: (data: Uint8Array) => Promise<StagedAsset>;
    readonly insert?: (input: InsertGraphicInput) => boolean;
  },
): Promise<number> {
  let inserted = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const staged = await stageGraphicBytes(bytes, {
      stage: deps.stage,
      messages: deps.messages,
    });
    if (staged === null) continue;
    const input: InsertGraphicInput = {
      kind: "image",
      assetId: staged.assetId,
      heightLines: 8,
      aspectWidth: staged.width,
      aspectHeight: staged.height,
    };
    const ok = deps.insert
      ? deps.insert(input)
      : runGraphicInsert(deps.docId, input);
    if (ok) inserted += 1;
  }
  return inserted;
}

function readSelectedGraphicFromEditor(
  editor: ScriptEditor,
): SelectedGraphicSnapshot | null {
  const { $from } = editor.view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "block") continue;
    if (node.attrs.type !== "graphic") return null;
    const raw: unknown = node.attrs.graphic;
    if (typeof raw !== "object" || raw === null) return null;
    const rec = raw as Record<string, unknown>;
    const kind: GraphicKind =
      rec.kind === "lower_third" ||
      rec.kind === "ots" ||
      rec.kind === "full_screen"
        ? rec.kind
        : "image";
    return {
      blockId: typeof node.attrs.id === "string" ? node.attrs.id : "",
      attrs: {
        kind,
        assetId: typeof rec.assetId === "string" ? rec.assetId : null,
        heightLines: typeof rec.heightLines === "number" ? rec.heightLines : 6,
        label: typeof rec.label === "string" ? rec.label : "",
        alt: typeof rec.alt === "string" ? rec.alt : "",
        aspectWidth:
          typeof rec.aspectWidth === "number" ? rec.aspectWidth : null,
        aspectHeight:
          typeof rec.aspectHeight === "number" ? rec.aspectHeight : null,
      },
    };
  }
  return null;
}

const imageFilesFrom = (list: FileList | null | undefined): File[] =>
  !list || list.length === 0
    ? []
    : [...list].filter((f) => f.type.startsWith("image/") || f.type === "");

/** Connects one mounted ScriptEditor to the graphics bridge, selection sync, and drag-drop/paste handlers. */
export function attachGraphicsBridge(options: {
  readonly docId: string;
  readonly editor: ScriptEditor;
  readonly services: Pick<PersonServices, "userId" | "messages" | "library">;
  readonly editable: boolean;
}): () => void {
  const { docId, editor, services } = options;
  const unregister = registerGraphicController(docId, {
    insertGraphic: (input) => editor.insertGraphic(input),
    updateGraphicAttrs: (patch, blockId) =>
      editor.updateGraphicAttrs(patch, blockId),
    setGraphicHeightLines: (heightLines, blockId) =>
      editor.setGraphicHeightLines(heightLines, blockId),
    removeGraphicImage: (blockId) => editor.removeGraphicImage(blockId),
    selectedGraphic: () => readSelectedGraphicFromEditor(editor),
  });

  const stage = async (bytes: Uint8Array): Promise<StagedAsset> => {
    const projectId = services.library.documentProject(docId).get() ?? docId;
    const pooled = await getProjectAssetUploader(services, projectId);
    if (pooled === null)
      throw new AssetValidationError(
        "unsupported_type",
        "Offline asset storage unavailable.",
      );
    return pooled.uploader.stageAsset(bytes);
  };

  const dom = editor.view.dom;
  const onSelectSync = (): void => syncSelectedGraphic(docId);
  const onDragOver = (event: DragEvent): void => {
    if (options.editable && event.dataTransfer?.types.includes("Files"))
      event.preventDefault();
  };
  const ingest = (list: FileList | null | undefined, event: Event): void => {
    if (!options.editable) return;
    const files = imageFilesFrom(list);
    if (files.length === 0) return;
    event.preventDefault();
    void handleDroppedOrPastedImages(files, {
      docId,
      messages: services.messages,
      stage,
    });
  };
  const onDrop = (e: DragEvent): void => ingest(e.dataTransfer?.files, e);
  const onPaste = (e: ClipboardEvent): void =>
    ingest(e.clipboardData?.files, e);

  dom.addEventListener("keyup", onSelectSync);
  dom.addEventListener("mouseup", onSelectSync);
  dom.addEventListener("focusin", onSelectSync);
  dom.addEventListener("dragover", onDragOver);
  dom.addEventListener("drop", onDrop);
  dom.addEventListener("paste", onPaste);

  return () => {
    dom.removeEventListener("keyup", onSelectSync);
    dom.removeEventListener("mouseup", onSelectSync);
    dom.removeEventListener("focusin", onSelectSync);
    dom.removeEventListener("dragover", onDragOver);
    dom.removeEventListener("drop", onDrop);
    dom.removeEventListener("paste", onPaste);
    unregister();
  };
}
