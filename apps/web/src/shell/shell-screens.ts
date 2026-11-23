// The screen each route shows and what it does with the page; a route adds its row with one line.
import type { ScreenId } from "@manent/commands";

export interface ShellScreen {
  readonly routeId: string;
  readonly screen: ScreenId;
  /**
   * `shown`: the page is drawn with the screen's frame around it. `covered`: the screen covers everything from the
   * title bar to the status bar, the page kept mounted under it. `bare`: only the page region is drawn, with no demo
   * bar, palette or global keys.
   */
  readonly page: "shown" | "covered" | "bare";
}

/** A route with no row shows the Library's screen id, covered. */
export const SHELL_SCREENS: readonly ShellScreen[] = [
  { routeId: "/", screen: "library", page: "covered" },
  { routeId: "/s/$docId", screen: "document", page: "shown" },
  { routeId: "/s/$docId/send/$form", screen: "send", page: "covered" },
  { routeId: "/preferences/$pane", screen: "preferences", page: "covered" },
  { routeId: "/choose", screen: "choose", page: "covered" },
  { routeId: "/__stand-in", screen: "document", page: "shown" },
];
