// Handlers for Account commands: sign out with waiting-changes guard.
import type { CommandHandlers } from "@manent/commands";
import { resolveWaitingScripts } from "../account/export-waiting.ts";
import { ensureFallbackSignOutHost } from "../account/sign-out-dialog.tsx";
import {
  closeSignOutPrompt,
  hasMountedSignOutHost,
  isSignOutPromptOpen,
  openSignOutPrompt,
} from "../account/sign-out-store.ts";
import type { WaitingDocumentSummary } from "../services/ports.ts";
import { chooseUrl } from "../session.ts";
import type { HandlerDeps } from "./index.ts";

export function accountHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "app.signOut"> {
  const { services, usePerson, router, now } = deps;
  let checking = false;

  const completeSignOut = (): void => {
    closeSignOutPrompt();
    usePerson.getState().setPerson(null);
    router.navigate(chooseUrl("/"));
  };

  return {
    "app.signOut"() {
      if (checking || isSignOutPromptOpen()) return;
      checking = true;
      void services
        .waitingDocuments()
        .catch((): readonly WaitingDocumentSummary[] => [])
        .then(async (waiting) => {
          const totalWaiting = waiting.reduce(
            (sum, doc) => sum + doc.waiting,
            0,
          );
          if (totalWaiting <= 0) {
            checking = false;
            completeSignOut();
            return;
          }
          const scripts = await resolveWaitingScripts(services, waiting);
          checking = false;
          if (!hasMountedSignOutHost()) ensureFallbackSignOutHost(now);
          openSignOutPrompt({
            totalWaiting,
            scripts,
            services,
            now,
            onConfirm: completeSignOut,
            onCancel: closeSignOutPrompt,
          });
        });
    },
  };
}
