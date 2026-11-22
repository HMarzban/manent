// What the node core is built from: storage, its records, the server's HTTP, one upstream client per person, and the world.
import type {
  Directory,
  RenderPdf,
  SettingRules,
  SignInProvider,
} from "@manent/server-core";
import type { Storage } from "@manent/storage";
import type {
  Clock,
  LocalStore,
  Random,
  SyncClient,
} from "@manent/sync-client";
import type {
  AdoptRequest,
  AdoptResponse,
  DescribeRequest,
  DescribeResponse,
  DesktopGlobal,
  FirstPaintWrite,
  HttpErrorCode,
  ServerVersions,
} from "@manent/sync-protocol";
import type { NodeRecords } from "../records/ports.ts";

/** The server's HTTP, as the node uses it; every call rejects ConnectError("unreachable") off the network. */
export interface CloudApi {
  signIn(
    userId: string,
  ): Promise<{ ok: true; token: string } | { ok: false; code: "unknown_user" }>;
  demo(): Promise<{ seedId: string | null }>;
  describe(
    token: string,
    request: DescribeRequest,
  ): Promise<
    | { ok: true; body: DescribeResponse }
    | {
        ok: false;
        code: "unauthenticated" | "forbidden" | "deleted" | "bad_request";
      }
  >;
  adopt(
    token: string,
    request: AdoptRequest,
  ): Promise<
    { ok: true; body: AdoptResponse } | { ok: false; code: HttpErrorCode }
  >;
  /** `request` sent on as it is, as the person `token` signs in, and the cloud's answer as it came. */
  forward(token: string, request: Request): Promise<Response>;
}

/** One upstream client per person. */
export interface UpstreamFactory {
  create(userId: string, token: () => string | null): SyncClient;
  /** The store that person's upstream client keeps its documents in. */
  store(userId: string): LocalStore;
}

export interface NodeCoreOptions {
  storage: Storage;
  records: NodeRecords;
  cloud: CloudApi;
  upstream: UpstreamFactory;
  clock: Clock;
  defer(fn: () => void): void;
  random: Random;
  signIn: SignInProvider;
  directory: Directory;
  versions: ServerVersions;
  build: string;
  webDir: string | null;
  launchToken: string;
  /** PRODUCT_SETTING_RULES in production. */
  registry: SettingRules;
  /** Draws the issued files of the scripts the node is the authority of. */
  renderPdf: RenderPdf;
  /** The page's startup values, for the boot script; null: insert none. */
  boot: (() => { global: DesktopGlobal; boot: FirstPaintWrite[] }) | null;
  /** scripts: placed documents of kind script without a tombstone; bytes: every file under the store. */
  storeUsage(): { scripts: number; bytes: number };
  /** http://127.0.0.1:<bound port>: the hosts and the socket's origin are built from it. */
  nodeUrl: string;
  /** Empties the store for the demo's new seed: every document, every person's upstream store, and the records but the secret and the people. */
  wipe(): Promise<void>;
}
