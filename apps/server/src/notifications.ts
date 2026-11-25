// Outbound comment notifications: webhook, Slack, and Resend email.
import { createDemoDirectory } from "@manent/demo";
import { createNotificationsService } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const notificationsService: ServerService = {
  create(deps) {
    const notify = createNotificationsService({
      storage: deps.storage,
      users: createDemoDirectory(),
      clock: deps.clock,
      openUrl: deps.openUrl ?? "http://localhost:4747",
      resendApiKey: deps.resendApiKey ?? null,
      resendFrom: deps.resendFrom ?? null,
      fetch: globalThis.fetch,
      log: deps.log,
    });
    return { hooks: [notify], config: { notify } };
  },
};
