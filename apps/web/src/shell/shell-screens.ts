// The screen each route shows and what it does with the page; a route adds its row with one line.
import type { ScreenId } from "@manent/commands";
import type { DocKind } from "@manent/sync-protocol";

export interface ShellScreen {
  readonly routeId: string;
  readonly screen: ScreenId;
  /**
   * `shown`: the page is drawn with the screen's frame around it. `covered`: the screen covers everything from the
   * title bar to the status bar, the page kept mounted under it. `bare`: no demo bar, palette or global keys; the
   * page region stays shown unless `covered` is true.
   */
  readonly page: "shown" | "covered" | "bare";
  /** True when the route draws its own surface over the editor host. */
  readonly covered: boolean;
}

/** A route with no row shows the Library's screen id, covered. */
export const SHELL_SCREENS: readonly ShellScreen[] = [
  { routeId: "/", screen: "library", page: "covered", covered: true },
  { routeId: "/s/$docId", screen: "document", page: "shown", covered: false },
  {
    routeId: "/s/$docId/send/$form",
    screen: "send",
    page: "covered",
    covered: true,
  },
  {
    routeId: "/preferences/$pane",
    screen: "preferences",
    page: "covered",
    covered: true,
  },
  { routeId: "/choose", screen: "choose", page: "covered", covered: true },
  { routeId: "/__stand-in", screen: "document", page: "shown", covered: false },
  {
    routeId: "/s/$docId/present",
    screen: "present",
    page: "bare",
    covered: false,
  },
  {
    routeId: "/s/$docId/prompter",
    screen: "present",
    page: "bare",
    covered: true,
  },
  {
    routeId: "/p/$projectId/settings",
    screen: "project_settings",
    page: "covered",
    covered: true,
  },
  {
    routeId: "/w/$workspaceId/settings",
    screen: "workspace_settings",
    page: "covered",
    covered: true,
  },
  {
    routeId: "/w/$workspaceId/settings/$group",
    screen: "workspace_settings",
    page: "covered",
    covered: true,
  },
  {
    routeId: "/p/$projectId/board",
    screen: "board",
    page: "covered",
    covered: true,
  },
  { routeId: "/r/$token", screen: "reader", page: "covered", covered: true },
];

/** Whether the editor host under `screen` is covered by the route or by a document kind that draws its own surface. */
export function isPageCovered(
  screen: Pick<ShellScreen, "page" | "covered">,
  docKind: DocKind | null,
): boolean {
  return (
    screen.page === "covered" ||
    screen.covered ||
    (screen.page === "shown" && docKind === "rundown")
  );
}
