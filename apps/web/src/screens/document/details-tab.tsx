// The side panel's Details tab: its scopes Selection, Scene and Script, each drawn while it has a section.
import { DOCUMENT_WORDS } from "@manent/ui";
import { Suspense, lazy, useEffect } from "react";
import type { ReactNode } from "react";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { DETAILS_SECTIONS } from "./details-sections.ts";
import type { DetailsSection } from "./details-sections.ts";

// its controls would push the document screen's chunk over its size budget
const loadScriptSettings = () => import("./script-settings.tsx");
const ScriptSettings = lazy(async () => ({
  default: (await loadScriptSettings()).ScriptSettings,
}));

const SCOPES: readonly { scope: DetailsSection["scope"]; heading: string }[] =
  Object.freeze([
    { scope: "selection", heading: DOCUMENT_WORDS.selectionScope },
    { scope: "scene", heading: DOCUMENT_WORDS.sceneScope },
    { scope: "script", heading: DOCUMENT_WORDS.scriptScope },
  ]);

/** The Script scope is always drawn, its own Script settings first, then the sections later features register. */
function DetailsPanel(props: { docId: string }): ReactNode {
  const { docId } = props;
  return SCOPES.map(({ scope, heading }) => {
    const sections = DETAILS_SECTIONS.filter(
      (section) => section.scope === scope,
    );
    if (scope !== "script" && sections.length === 0) return null;
    return (
      <section key={scope} className="flex flex-col gap-2 p-2">
        <h2 className="text-meta font-semibold text-fg-muted">{heading}</h2>
        {scope === "script" ? (
          <Suspense fallback={null}>
            <ScriptSettings docId={docId} />
          </Suspense>
        ) : null}
        {sections.map(({ id, Section }) => (
          <Section key={id} docId={docId} />
        ))}
      </section>
    );
  });
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
