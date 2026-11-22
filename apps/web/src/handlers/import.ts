// The handlers of the commands that bring a file in, and the person's file opener they reach.
import type { CommandHandlers } from "@manent/commands";
import { domXml } from "../import/dom-xml.ts";
import { pickFiles } from "../import/file-picker.ts";
import type { FileOpener } from "../import/open-files.ts";
import { IMPORTABLE_EXTENSIONS, importReaders } from "../import/readers.ts";
import type { HandlerDeps } from "./index.ts";
import { shownWorkspace } from "./shown-workspace.ts";

// Open… asks the desktop app's shell for files, which the page cannot do yet
const nothingYet = (): void => {};

/** Makes the person's opener, loaded apart from the first load, and registers it once it is made. */
async function createOpener(deps: HandlerDeps): Promise<FileOpener> {
  // schema's values hold ProseMirror's model, which the first load does without
  const [opening, memory, { randomBlockId }] = await Promise.all([
    import("../import/open-files.ts"),
    import("../import/reopen.ts"),
    import("@manent/schema"),
  ]);
  const { services } = deps;
  const opener = opening.createFileOpener({
    readers: importReaders(domXml),
    library: services.library,
    messages: services.messages,
    place: async () => ({
      workspaceId: await shownWorkspace(deps),
      navigate: (path) => deps.router.navigate(path),
    }),
    reopen: memory.createReopenMemory({
      storage: deps.storage,
      userId: services.userId,
    }),
    userId: services.userId,
    now: deps.now,
    ids: randomBlockId,
    randomKey: opening.randomKey,
    sha256: opening.sha256,
    language: deps.language,
  });
  opening.registerFileOpener(opener);
  return opener;
}

export function importHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "file.import" | "file.open" | "file.importAgain"> {
  const opener = createOpener(deps);
  return {
    "file.import"() {
      void (async () => {
        const files = await pickFiles({ accept: IMPORTABLE_EXTENSIONS });
        await (await opener).open(files);
      })();
    },
    "file.open": nothingYet,
    "file.importAgain"() {
      void import("../import/open-files.ts").then(({ fileOpener }) =>
        fileOpener()?.importAgain(),
      );
    },
  };
}
