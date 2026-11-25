// The side panel's Details tab: its scopes Selection, Scene, Script and Rundown, each drawn while it has a section.
import { DOCUMENT_WORDS, useSubscribable } from "@manent/ui";
import { Suspense, lazy, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { panelsActions } from "../../state/panels.store.ts";
import { DETAILS_SECTIONS } from "./details-sections.ts";
import type { DetailsScope } from "./details-sections.ts";
import { PanelListSkeleton } from "./panel-surface.tsx";

// its controls would push the document screen's chunk over its size budget
const loadScriptSettings = () => import("./script-settings.tsx");
const ScriptSettings = lazy(async () => ({
  default: (await loadScriptSettings()).ScriptSettings,
}));

const SCOPES: readonly { scope: DetailsScope; heading: string }[] =
  Object.freeze([
    { scope: "selection", heading: DOCUMENT_WORDS.selectionScope },
    { scope: "scene", heading: DOCUMENT_WORDS.sceneScope },
    { scope: "script", heading: DOCUMENT_WORDS.scriptScope },
    { scope: "rundown", heading: DOCUMENT_WORDS.rundownScope },
  ]);

/** The Script scope is always drawn on a non-rundown; a rundown draws its Rundown scope alone. */
function DetailsPanel(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const docKindSource = useMemo(
    () => services.library.docKindOf(docId),
    [services.library, docId],
  );
  const isRundown = useSubscribable(docKindSource) === "rundown";
  return SCOPES.map(({ scope, heading }) => {
    if (isRundown ? scope !== "rundown" : scope === "rundown") return null;
    const sections = DETAILS_SECTIONS.filter(
      (section) => section.scope === scope,
    );
    if (scope !== "script" && sections.length === 0) return null;
    return (
      <section key={scope} data-scope={scope} className="flex flex-col pb-2">
        <h2 className="mn-group-label">{heading}</h2>
        <div className="flex flex-col gap-2 px-3">
          {scope === "script" ? (
            <Suspense fallback={<PanelListSkeleton />}>
              <ScriptSettings docId={docId} />
            </Suspense>
          ) : null}
          {sections.map(({ id, Section }) => (
            <Section key={id} docId={docId} />
          ))}
        </div>
      </section>
    );
  });
}

/** Opens Details with `scope` at the top of the tab once it is drawn; focus stays where it is. */
export function openDetailsAt(
  scope: DetailsScope,
  frame: (fn: () => void) => () => void,
): void {
  panelsActions.open("side", "details");
  frame(() =>
    document
      .querySelector(`[data-scope="${scope}"]`)
      ?.scrollIntoView({ block: "start" }),
  );
}

function DetailsTab(props: { docId: string | null }): ReactNode {
  return props.docId === null ? null : <DetailsPanel docId={props.docId} />;
}

export const detailsTab: PanelTab<"details"> = {
  id: "details",
  useTab(docId) {
    const present = docId !== null;
    // fetched while a document is open, so it is ready before the tab is opened
    useEffect(() => {
      if (present) void loadScriptSettings();
    }, [present]);
    return { present, label: DOCUMENT_WORDS.detailsTab };
  },
  Tab: DetailsTab,
};
