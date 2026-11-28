// The title page and book front/back matter as the editor reads and writes them on the script's titlePage map.
import { AssetValidationError } from "@manent/client-web";
import { ORIGIN_TITLE_PAGE, bookMatter, titlePage } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { TitlePageSource } from "@manent/editor";
import { EDITOR_WORDS } from "@manent/ui";
import { pickImageFile } from "../graphics/insert-graphic.ts";
import type { PersonServices } from "../services/ports.ts";
import { getProjectAssetUploader } from "./asset-pool.ts";
import { graphicAssetPortFor, stageGraphicBytes } from "./graphics-bridge.ts";

export function titlePageSource(
  doc: CrdtDoc,
  coverContext?: {
    readonly docId: string;
    readonly services: Pick<PersonServices, "userId" | "messages" | "library">;
  },
): TitlePageSource {
  const fields = titlePage(doc);
  const matter = bookMatter(doc);
  const assetPort =
    coverContext !== undefined
      ? graphicAssetPortFor(coverContext.services, coverContext.docId)
      : null;

  return {
    port: {
      get: () => fields.fields(),
      set: (field, value) => fields.set(field, value, ORIGIN_TITLE_PAGE),
      subscribe: (listener) => fields.subscribe(() => listener()),
    },
    words: EDITOR_WORDS.titlePage,
    bookMatter: {
      port: {
        get: () => matter.fields(),
        set: (field, value) => matter.set(field, value, ORIGIN_TITLE_PAGE),
        subscribe: (listener) => matter.subscribe(() => listener()),
        pickCover:
          coverContext === undefined
            ? undefined
            : async () => {
                const file = await pickImageFile();
                if (file === null) return null;
                const bytes = new Uint8Array(await file.arrayBuffer());
                const { services, docId } = coverContext;
                const staged = await stageGraphicBytes(bytes, {
                  messages: services.messages,
                  stage: async (data) => {
                    const projectId = services.library
                      .documentProject(docId)
                      .get();
                    if (projectId === null)
                      throw new AssetValidationError(
                        "unsupported_type",
                        "Project is not known for this document.",
                      );
                    const pooled = await getProjectAssetUploader(
                      services,
                      projectId,
                    );
                    if (pooled === null)
                      throw new AssetValidationError(
                        "unsupported_type",
                        "Offline asset storage unavailable.",
                      );
                    return pooled.uploader.stageAsset(data);
                  },
                });
                return staged?.assetId ?? null;
              },
        resolveCoverUrl:
          assetPort === null
            ? undefined
            : (assetId) => assetPort.resolveUrl(assetId),
      },
      words: EDITOR_WORDS.bookMatter,
    },
  };
}
