// The person's commands in the desktop app: the shell's native menus run them, and are drawn from them.
import { COMMANDS, menuModel } from "@manent/commands";
import type { CommandService } from "@manent/commands";
import type { Clock } from "@manent/sync-client";
import { NATIVE_MENU_IDS } from "@manent/sync-protocol";
import type { DesktopHost } from "./host.ts";
import { NATIVE_MENU_PLATFORMS, createMenuSender } from "./native-menu.ts";

/**
 * Each menu command the shell sends runs through `service` as a native menu run; where the system draws native menus,
 * they are sent again whenever `service` notifies. The returned function ends both.
 */
export function connectShellCommands(options: {
  host: DesktopHost;
  service: CommandService;
  clock: Clock;
}): () => void {
  const { host, service, clock } = options;
  const stopHearing = host.onMessage((message) => {
    if (message.t === "menu_command") service.run(message.id, "native_menu");
  });
  if (!NATIVE_MENU_PLATFORMS.includes(host.platform)) return stopHearing;
  const sender = createMenuSender({
    host,
    models: () =>
      NATIVE_MENU_IDS.map((menu) => menuModel(menu, COMMANDS, service)),
    clock,
  });
  const stopFollowing = service.subscribe(sender.changed);
  sender.changed();
  return () => {
    stopHearing();
    stopFollowing();
    sender.stop();
  };
}
