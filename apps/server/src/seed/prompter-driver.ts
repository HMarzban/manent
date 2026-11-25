// The seed driver's sends to a rundown's prompter through the server's routes.
import type { SeedPrompter } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Prompter driver over `/api/prompter/send` and `/api/prompter/send-previous`. */
export function createPrompterDriver(d: Driving): SeedPrompter {
  const post = async (
    userId: string,
    path: string,
    docId: string,
    rowId: string,
  ): Promise<void> => {
    await d.call(userId, {
      method: "POST",
      path,
      body: { docId, rowId, key: d.key() },
    });
    await d.runDue();
  };
  return {
    send: (userId, rundownId, rowId) =>
      post(userId, "/api/prompter/send", rundownId, rowId),
    sendPrevious: (userId, rundownId, rowId) =>
      post(userId, "/api/prompter/send-previous", rundownId, rowId),
  };
}
