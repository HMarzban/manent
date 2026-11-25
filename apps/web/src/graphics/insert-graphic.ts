// Zero-dialog graphic insertion: native OS file picker for images, 1-click chyron insertion,
// and image replacement for a selected graphic block.
import { AssetValidationError } from "@manent/client-web";
import type { StagedAsset } from "@manent/client-web";
import type { GraphicKind } from "@manent/schema";
import {
  getProjectAssetUploader,
  pushGraphicRefusal,
  runGraphicInsert,
  runGraphicUpdate,
  stageGraphicBytes,
} from "../editor-host/graphics-bridge.ts";
import type { PersonServices } from "../services/ports.ts";

export const GRAPHIC_FILE_ACCEPT = "image/png,image/jpeg,image/webp";

const CHYRON_DEFAULT_LINES: Readonly<
  Record<Exclude<GraphicKind, "image">, number>
> = Object.freeze({
  lower_third: 4,
  ots: 6,
  full_screen: 10,
});

export interface PickedImageFile {
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Opens the browser's native OS file picker (zero modal dialog) and resolves with the chosen file or null. */
export function pickImageFile(
  accept = GRAPHIC_FILE_ACCEPT,
): Promise<PickedImageFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const finish = (file: PickedImageFile | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
    });
    input.addEventListener("cancel", () => finish(null));
    document.body.append(input);
    input.click();
  });
}

async function stageForDoc(
  services: Pick<PersonServices, "userId" | "messages" | "library">,
  docId: string,
  bytes: Uint8Array,
  stageOverride?: (data: Uint8Array) => Promise<StagedAsset>,
): Promise<StagedAsset | null> {
  const stage =
    stageOverride ??
    (async (data: Uint8Array): Promise<StagedAsset> => {
      const projectId = services.library.documentProject(docId).get() ?? docId;
      const pooled = await getProjectAssetUploader(services, projectId);
      if (pooled === null)
        throw new AssetValidationError(
          "unsupported_type",
          "Offline asset storage unavailable.",
        );
      return pooled.uploader.stageAsset(data);
    });
  return stageGraphicBytes(bytes, { stage, messages: services.messages });
}

/** Opens the native file picker and inserts a new `"graphic"` image block with zero modal dialog. */
export async function insertImageFromPicker(
  services: Pick<PersonServices, "userId" | "messages" | "library">,
  docId: string,
  options?: {
    readonly pickFile?: () => Promise<PickedImageFile | null>;
    readonly stage?: (data: Uint8Array) => Promise<StagedAsset>;
  },
): Promise<boolean> {
  const file = await (options?.pickFile ?? (() => pickImageFile()))();
  if (file === null) return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const staged = await stageForDoc(services, docId, bytes, options?.stage);
  if (staged === null) return false;
  return runGraphicInsert(docId, {
    kind: "image",
    assetId: staged.assetId,
    heightLines: 8,
    aspectWidth: staged.width,
    aspectHeight: staged.height,
  });
}

/** Opens the native file picker and attaches or replaces the image on an existing graphic block. */
export async function replaceImageFromPicker(
  services: Pick<PersonServices, "userId" | "messages" | "library">,
  docId: string,
  blockId: string,
  options?: {
    readonly pickFile?: () => Promise<PickedImageFile | null>;
    readonly stage?: (data: Uint8Array) => Promise<StagedAsset>;
  },
): Promise<boolean> {
  const file = await (options?.pickFile ?? (() => pickImageFile()))();
  if (file === null) return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const staged = await stageForDoc(services, docId, bytes, options?.stage);
  if (staged === null) return false;
  return runGraphicUpdate(
    docId,
    {
      assetId: staged.assetId,
      aspectWidth: staged.width,
      aspectHeight: staged.height,
    },
    blockId,
  );
}

/** Inserts a 1-click broadcast chyron (`lower_third`, `ots`, or `full_screen`) directly onto the page. */
export function insertChyron(
  docId: string,
  kind: Exclude<GraphicKind, "image">,
): boolean {
  return runGraphicInsert(docId, {
    kind,
    assetId: null,
    heightLines: CHYRON_DEFAULT_LINES[kind],
  });
}

/** Reports a server 413 quota refusal to the message slot. */
export function reportGraphicQuotaRefusal(
  services: Pick<PersonServices, "messages">,
): void {
  pushGraphicRefusal(services.messages, "quota_exceeded");
}
