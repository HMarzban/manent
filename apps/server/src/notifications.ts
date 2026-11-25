// Outbound comment notifications: webhook, Slack, and Resend email.
import { createDemoDirectory } from "@manent/demo";
import { createNotificationsService } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const notificationsService: ServerService = {
  create(deps) {
    const resendApiKey =
      deps.resendApiKey !== undefined
        ? deps.resendApiKey
        : process.env.MANENT_RESEND_API_KEY?.trim() || null;
    const resendFrom =
      deps.resendFrom !== undefined
        ? deps.resendFrom
        : process.env.MANENT_RESEND_FROM?.trim() || null;
    const notify = createNotificationsService({
      storage: deps.storage,
      users: createDemoDirectory(),
      clock: deps.clock,
      openUrl: deps.openUrl ?? "http://localhost:4747",
      resendApiKey,
      resendFrom,
      fetch: globalThis.fetch,
      log: console.error,
    });
    return { hooks: [notify], config: { notify } };
  },
};
