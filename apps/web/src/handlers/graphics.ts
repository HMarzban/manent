// Command handlers for inline image and broadcast chyron insertion (lazy-loaded off the entry chunk).
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

type GraphicCommandId =
  | "graphics.insertImage"
  | "graphics.insertLowerThird"
  | "graphics.insertOts"
  | "graphics.insertFullScreen";

const loadGraphics = () => import("../graphics/insert-graphic.ts");

export function graphicsHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, GraphicCommandId> {
  const shown = (): string | null => deps.shellState().docId;
  const chyron = (kind: "lower_third" | "ots" | "full_screen") => (): void => {
    const docId = shown();
    if (docId === null) return;
    void loadGraphics().then((mod) => mod.insertChyron(docId, kind));
  };
  return {
    "graphics.insertImage"() {
      const docId = shown();
      if (docId === null) return;
      void loadGraphics().then((mod) =>
        mod.insertImageFromPicker(deps.services, docId),
      );
    },
    "graphics.insertLowerThird": chyron("lower_third"),
    "graphics.insertOts": chyron("ots"),
    "graphics.insertFullScreen": chyron("full_screen"),
  };
}
