// State-bar fact while the desktop app is writing prompter files: shown on every document until stopped.
import type { StateFact } from "@manent/ui";
import { useMemo } from "react";
import { usePrompterFilesState } from "./store.ts";

const NONE: readonly StateFact[] = Object.freeze([]);

export function usePrompterFilesFacts(): readonly StateFact[] {
  const { status } = usePrompterFilesState();
  const path = status !== null && status.failure === null ? status.path : null;
  return useMemo(
    () => (path === null ? NONE : [{ kind: "prompter_files", path }]),
    [path],
  );
}
