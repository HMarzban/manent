// Lazy shell-level overlays mounted outside the grid so their code stays off the entry chunk.
import { SurfaceBoundary, useCommandState } from "@manent/ui";
import { Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { isValidActiveTourStep } from "../demo/tour-highlights.ts";
import { loadApart } from "../load-apart.ts";
import { useEnvironment } from "../services/context.tsx";
import { useOpenDialog } from "../state/dialog.store.ts";
import { usePanel } from "../state/panels.store.ts";
import { tourActions, useTourActive } from "../state/tour.store.ts";
import { routeHasTourPanel } from "./shell-screens.ts";

// the closed-panel floating Tour bar loads only while a Tour scenario is active with the side panel closed
const tourFloat = loadApart(
  async () => (await import("../demo/tour-floating-bar.tsx")).TourFloatingBar,
);
const TourFloatingBar = tourFloat.Component;

const saveTemplateHost = loadApart(
  async () =>
    (await import("../templates/save-template-dialog.tsx")).SaveTemplateHost,
);
const SaveTemplateHost = saveTemplateHost.Component;

export function SaveTemplateDialogHost(props: {
  readonly docId: string | null;
}): ReactNode {
  const open = useOpenDialog() === "save_template";
  if (!open) return null;
  return (
    <SurfaceBoundary fallback={() => null}>
      <Suspense fallback={null}>
        <SaveTemplateHost docId={props.docId} />
      </Suspense>
    </SurfaceBoundary>
  );
}

export function TourFloatingHost(props: {
  readonly routeId: string;
}): ReactNode {
  const { tabStorage } = useEnvironment();
  const tourVisible = useCommandState("demo.tour").visible;
  const active = useTourActive();
  const side = usePanel("side").tab;
  useEffect(() => {
    if (!tourVisible) return;
    tourActions.hydrate(tabStorage, isValidActiveTourStep);
  }, [tabStorage, tourVisible]);
  if (
    !tourVisible ||
    active === null ||
    (routeHasTourPanel(props.routeId) && side === "tour")
  )
    return null;
  return (
    <SurfaceBoundary fallback={() => null}>
      <Suspense fallback={null}>
        <TourFloatingBar routeId={props.routeId} />
      </Suspense>
    </SurfaceBoundary>
  );
}
