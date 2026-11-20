// The cloud's HTTP for tests: a real server in memory reached without a socket, which can lose a call
// on either side of the cloud or be down altogether.
import type { ManentServer } from "@manent/server-core";
import type { CloudApi } from "../node/ports.ts";
import { httpCloudApi } from "../upstream/cloud-api.ts";

/** The host every request names, which the server's `allowedHosts` must hold. */
const CLOUD_URL = "http://127.0.0.1";

/**
 * Over `server.fetch`. `drop("request")` loses the next call before the cloud sees it, and
 * `drop("response")` the answer to the next one after the cloud did it; `down(true)` makes every
 * call fail as a cloud nobody can reach does.
 */
export function createFakeCloud(options: { server: ManentServer }): CloudApi & {
  drop(next: "request" | "response"): void;
  down(on: boolean): void;
} {
  let dropping: "request" | "response" | null = null;
  let isDown = false;
  const lose = (): never => {
    dropping = null;
    throw new TypeError("the connection to the cloud was lost");
  };
  const reach = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    if (isDown) throw new TypeError("the cloud cannot be reached");
    if (dropping === "request") lose();
    const answer = await options.server.fetch(new Request(input, init), {
      remoteAddress: "127.0.0.1",
      upgrade: () => false,
    });
    if (answer === null) throw new TypeError("a cloud call was upgraded");
    if (dropping === "response") lose();
    return answer;
  };
  const fetch: typeof globalThis.fetch = Object.assign(reach, {
    preconnect: () => {},
  });
  return {
    ...httpCloudApi({ baseUrl: CLOUD_URL, fetch }),
    drop(next) {
      dropping = next;
    },
    down(on) {
      isDown = on;
    },
  };
}
