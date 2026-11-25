// Mounted once in AppShell: binds prompterFilesStore to the desktop host and draws its dialog when open.
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { readPerson } from "../session.ts";
import { PrompterFilesDialog } from "./prompter-files-dialog.tsx";
import {
  connectPrompterFiles,
  prompterFilesStore,
  usePrompterFilesState,
} from "./store.ts";

export function PrompterFilesHost(): ReactNode {
  const { desktop, tabStorage } = useEnvironment();
  const services = useServices();
  const { dialogRundownId } = usePrompterFilesState();

  useEffect(() => {
    if (desktop === null) return undefined;
    return connectPrompterFiles({
      host: desktop,
      getToken: () => readPerson(tabStorage)?.token ?? null,
      messages: services.messages,
      isRundown: (docId) =>
        services.library.docKindOf(docId).get() === "rundown",
    });
  }, [desktop, tabStorage, services.messages, services.library]);

  if (dialogRundownId === null) return null;
  return (
    <PrompterFilesDialog
      rundownId={dialogRundownId}
      onClose={() => prompterFilesStore.close()}
    />
  );
}
