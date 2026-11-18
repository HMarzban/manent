import { bindRefusal } from "@manent/demo";
import { checkDemoBind } from "@manent/server-core";

export interface ServerEnv {
  port: number;
  /** A private address to listen on as well as loopback; null for loopback only. */
  lanHost: string | null;
  dataDir: string;
  webDir: string;
  control: { url: string; token: string } | null;
}

const PORT = /^[1-9]\d{0,4}$/;

/** Reads the server's settings, or throws an Error whose message is one sentence for the terminal. */
export function readServerEnv(
  env: Record<string, string | undefined>,
): ServerEnv {
  if (env.MANENT_DEMO !== "1") {
    throw new Error(
      "This build has only the demo sign-in. Start it with `make demo`.",
    );
  }

  let port = 4747;
  if (env.MANENT_PORT !== undefined) {
    port = Number(env.MANENT_PORT);
    if (!PORT.test(env.MANENT_PORT) || port > 65_535) {
      throw new Error("MANENT_PORT must be a port number.");
    }
  }

  let lanHost: string | null = null;
  if (env.MANENT_LAN_HOST) {
    const host = env.MANENT_LAN_HOST;
    const check = checkDemoBind(host, { lan: true });
    if (!check.ok) throw new Error(bindRefusal(host, check.reason));
    lanHost = check.address;
  }

  const url = env.MANENT_CONTROL_URL || null;
  const token = env.MANENT_CONTROL_TOKEN || null;
  if ((url === null) !== (token === null)) {
    throw new Error(
      "MANENT_CONTROL_URL and MANENT_CONTROL_TOKEN must be set together.",
    );
  }

  return {
    port,
    lanHost,
    dataDir: env.MANENT_DATA_DIR || ".manent-demo",
    webDir: env.MANENT_WEB_DIR || "apps/web/dist",
    control: url !== null && token !== null ? { url, token } : null,
  };
}
