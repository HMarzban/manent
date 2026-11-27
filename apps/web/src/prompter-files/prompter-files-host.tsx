// Mounted once in AppShell: binds prompterFilesStore to the desktop host and draws its dialog when open.
import { useEffect, useRef } from "react";
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
  const { desktop, dom, tabStorage } = useEnvironment();
  const services = useServices();
  const { dialogRundownId } = usePrompterFilesState();
  const isOpen = dialogRundownId !== null;
  const wasOpen = useRef(false);
  const opener = useRef<Element | null>(null);

  if (isOpen && !wasOpen.current && typeof document !== "undefined") {
    const active = document.activeElement;
    if (
      active !== null &&
      active !== document.body &&
      active.closest("[role='dialog'], [role='alertdialog']") === null
    ) {
      opener.current = active;
    }
  }

  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const target = opener.current;
    opener.current = null;
    if (
      target instanceof HTMLElement &&
      target.isConnected &&
      target.closest("[inert]") === null
    ) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
    dom.restoreFocus();
  }, [isOpen, dom]);

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
