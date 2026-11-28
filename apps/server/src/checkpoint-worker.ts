// The checkpoint worker's entry: the first message names the data directory, every later one is a job.
import { isMainThread } from "node:worker_threads";
import { serveCheckpointJobs } from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";

function readDir(message: unknown): string {
  if (
    typeof message === "object" &&
    message !== null &&
    "data" in message &&
    typeof message.data === "object" &&
    message.data !== null &&
    "dir" in message.data &&
    typeof message.data.dir === "string"
  )
    return message.data.dir;
  throw new TypeError('the first message must be { t: "init", data: { dir } }');
}

if (!isMainThread) {
  const onInit = (init: MessageEvent) => {
    const storage = openSqliteStorage({
      dir: readDir(init.data),
      now: Date.now,
      durability: "normal",
    });
    serveCheckpointJobs(storage, {
      onMessage: (h) =>
        self.addEventListener("message", (e: MessageEvent) => h(e.data)),
      post: (m) => postMessage(m),
    });
  };
  self.addEventListener("message", onInit, { once: true });
}
