// Preferences, and Undo and Redo run from outside the page and the fields: the open script's own history, Preferences'
// undo list, and the reverse a setting's message offers.
import type { CommandHandlers } from "@manent/commands";
import type { SectionId } from "@manent/settings";
import { browserInstallStore } from "../pwa/install.ts";
import { safeNext } from "../session.ts";
import { rundownActions } from "../state/rundown.store.ts";
import type { HandlerDeps, RoutePlace } from "./index.ts";

const PREFERENCES_ROUTE = "/preferences/$pane";
const DOCUMENT_ROUTE = "/s/$docId";
const RELOAD_FALLBACK_MS = 1000;

/** Activates any waiting service worker and reloads the page to use the new build. */
async function reloadToUpdate(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker
      .getRegistration()
      .catch(() => undefined);
    if (registration?.waiting) {
      let reloaded = false;
      const reload = (): void => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", reload, {
        once: true,
      });
      registration.waiting.postMessage({ type: "SKIP_WAITING" }, []);
      setTimeout(reload, RELOAD_FALLBACK_MS);
      return;
    }
  }
  window.location.reload();
}

/** Where Preferences returns to while it is shown, validated as a path inside the app; elsewhere, here. */
function returnPlace(here: RoutePlace): string {
  if (here.routeId !== PREFERENCES_ROUTE) return here.href;
  const { from } = here.search;
  return safeNext(typeof from === "string" ? from : null);
}

const preferencesHref = (pane: SectionId, from: string): string =>
  `/preferences/${pane}?from=${encodeURIComponent(from)}`;

export function preferencesHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "app.preferences"
  | "app.shortcuts"
  | "app.aiPledge"
  | "app.benchmarkReport"
  | "app.reloadToUpdate"
  | "app.install"
  | "edit.undo"
  | "edit.redo"
  | "settings.undo"
> {
  const { services, router, visitUndo } = deps;
  const onPreferences = (): boolean =>
    router.here().routeId === PREFERENCES_ROUTE;
  // a screen that hides the page never touches the script
  const showsPage = (): boolean => router.here().routeId === DOCUMENT_ROUTE;
  const onRundown = (): boolean => {
    const { docId } = deps.shellState();
    return (
      docId !== null &&
      (rundownActions.context(docId) !== null ||
        services.library.docKindOf(docId).get() === "rundown")
    );
  };
  return {
    "app.preferences"() {
      const from = returnPlace(router.here());
      router.navigate(
        onPreferences() ? from : preferencesHref(services.lastPane.get(), from),
      );
    },
    "app.shortcuts": () =>
      router.navigate(preferencesHref("keyboard", returnPlace(router.here()))),
    // the pledge is read under This device's About
    "app.aiPledge": () =>
      router.navigate(preferencesHref("device", returnPlace(router.here()))),
    "app.benchmarkReport": () => {
      window.open("/benchmark-report.html", "_blank", "noopener,noreferrer");
    },
    "app.reloadToUpdate": () => {
      void reloadToUpdate();
    },
    "app.install": () => {
      void browserInstallStore()
        .promptInstall()
        .then((outcome) => {
          if (outcome === "unavailable")
            router.navigate(
              preferencesHref("device", returnPlace(router.here())),
            );
        });
    },
    // the page's and a field's own undo take the key before this runs; an undo with nothing to undo says nothing
    "edit.undo"() {
      if (onPreferences()) visitUndo.current?.undo();
      else if (showsPage() && onRundown())
        rundownActions.slot("rows")?.undo?.();
      else if (showsPage()) services.editor.run("edit.undo");
    },
    "edit.redo"() {
      if (showsPage() && onRundown()) rundownActions.slot("rows")?.redo?.();
      else if (showsPage()) services.editor.run("edit.redo");
    },
    "settings.undo"() {
      const shown = services.messages.current();
      if (shown !== null && services.reverses.run(shown.id))
        services.messages.dismiss(shown.id);
    },
  };
}
