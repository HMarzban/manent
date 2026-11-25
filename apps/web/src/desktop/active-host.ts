// The active desktop host for this window: bound while the page answers the shell, null on the web.
import type { DesktopHost } from "./host.ts";

let current: DesktopHost | null = null;

export function setActiveDesktopHost(host: DesktopHost | null): void {
  current = host;
}

export function activeDesktopHost(): DesktopHost | null {
  return current;
}
