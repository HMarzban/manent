// Handlers for Account commands: sign out with waiting-changes guard.
import type { CommandHandlers } from "@manent/commands";
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
      void (async () => {
        try {
          let waiting: readonly WaitingDocumentSummary[];
          try {
            waiting = await services.waitingDocuments();
          } catch {
            // Do not treat storage or sync read failures as zero waiting changes: open the protective guard prompt.
            if (usePerson.getState().person?.userId !== services.userId) return;
            if (!hasMountedSignOutHost()) ensureFallbackSignOutHost(now);
            openSignOutPrompt({
              totalWaiting: 1,
              scripts: [],
              services,
              now,
              onConfirm: completeSignOut,
              onCancel: closeSignOutPrompt,
            });
            return;
          }
          if (usePerson.getState().person?.userId !== services.userId) return;
          const totalWaiting = waiting.reduce(
            (sum, doc) => sum + doc.waiting,
            0,
          );
          if (totalWaiting <= 0) {
            completeSignOut();
            return;
          }
          const { resolveWaitingScripts } =
            await import("../account/export-waiting.ts");
          const scripts = await resolveWaitingScripts(services, waiting);
          if (usePerson.getState().person?.userId !== services.userId) return;
          if (!hasMountedSignOutHost()) ensureFallbackSignOutHost(now);
          openSignOutPrompt({
            totalWaiting,
            scripts,
            services,
            now,
            onConfirm: completeSignOut,
            onCancel: closeSignOutPrompt,
          });
        } finally {
          checking = false;
        }
      })();
    },
  };
}
