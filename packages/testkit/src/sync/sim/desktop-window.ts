// The window's reach into the node: its client, its requests answered by the node's server in
// memory, and its socket upgraded there and carried a frame at a time while the process lives.
import { bunTransport } from "@manent/local-node";
import type { NodeCore } from "@manent/local-node";
import type { Connection as Socket, ConnectionData } from "@manent/server-core";
import { ConnectError } from "@manent/sync-client";
import type {
  Clock,
  Connection,
  Random,
  SyncClient,
  Transport,
} from "@manent/sync-client";
import { createFaultyStoreSpace } from "@manent/sync-client/testing";
import { LAUNCH, NODE_URL, V1, createSimClient } from "./desktop-node.ts";
import type { NodeLife } from "./desktop-node.ts";
import { DOC, Device } from "./device.ts";
import type { Books } from "./device.ts";
import { HOME } from "./script.ts";

type Handlers = Parameters<Transport["connect"]>[0];

/** One socket from the window to the node; a close the node made waits behind what it sent. */
interface Wire {
  open: boolean;
  life: NodeLife;
  core: NodeCore;
  toNode: Uint8Array[];
  toWindow: (Uint8Array | { code: number; reason: string })[];
  socket: Socket;
  handlers: Handlers;
}

const AT = Object.freeze({ remoteAddress: "127.0.0.1", upgrade: () => false });

const unreachable = (): TypeError =>
  new TypeError("the node cannot be reached");

/** The window's socket is the link's own wire, never one the transport opens. */
const refuseSocket = (): never => {
  throw new ConnectError("unreachable");
};

const fieldOf = (body: unknown, key: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, key) : null;

export class WindowLink {
  /** The person's node token, once the node signed them in. */
  token: string | null = null;
  private readonly wires = new Set<Wire>();

  constructor(
    private readonly node: () => { life: NodeLife; core: NodeCore },
  ) {}

  /** A request as the window sends it; one the node dies during fails, as a dropped connection does. */
  readonly fetch: typeof fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const { life, core } = this.node();
      if (!life.alive) throw unreachable();
      const request = new Request(input, init);
      request.headers.set("X-Manent-Launch", LAUNCH);
      const dropped = Promise.withResolvers<never>();
      const drop = () => dropped.reject(unreachable());
      life.wires.add(drop);
      try {
        const answer = await Promise.race([
          core.server.fetch(request, AT),
          dropped.promise,
        ]);
        if (answer === null) throw unreachable();
        return answer;
      } finally {
        life.wires.delete(drop);
      }
    },
    { preconnect: () => {} },
  );

  /** A POST with the node token; the answer's JSON, null when there is none to read. */
  async post(path: string, body: unknown = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token !== null) headers.Authorization = `Bearer ${this.token}`;
    const init = { method: "POST", headers, body: JSON.stringify(body) };
    const answer = await this.fetch(`${NODE_URL}${path}`, init).catch(
      () => null,
    );
    return answer === null ? null : answer.json().catch(() => null);
  }

  /** The person chooses themselves at the node, as the chooser does. */
  async signIn(userId: string): Promise<void> {
    const chosen = await this.post("/api/sign-in", { userId });
    const token = fieldOf(chosen, "token");
    if (typeof token !== "string")
      throw new Error(`the node did not sign ${userId} in`);
    this.token = token;
  }

  /** The window's client on the script; `create` makes it on the node, as a script made on this device. */
  async open(options: {
    userId: string;
    books: Books;
    clock: Clock;
    random: () => Random;
    create: boolean;
  }): Promise<Device> {
    const { userId, books, clock } = options;
    const store = createFaultyStoreSpace().store(userId);
    const transport = this.transport();
    const make = (): SyncClient =>
      createSimClient({
        userId,
        deviceId: "window",
        transport,
        store,
        clock,
        random: options.random(),
        via: "local_node",
      });
    const client = make();
    const home = `${HOME.kind}:${HOME.id}`;
    const create = { kind: "script", home, workspaceId: null };
    const handle = await client.open(
      DOC,
      options.create ? { create } : undefined,
    );
    const opened = { client, handle, versions: V1 };
    return new Device(userId, "window", store, make, books, opened);
  }

  private transport(): Transport {
    const { fetch } = this;
    const token = (): string | null => this.token;
    const http = bunTransport({
      baseUrl: NODE_URL,
      token,
      fetch,
      socket: refuseSocket,
    });
    return { ...http, connect: (handlers) => this.connect(handlers) };
  }

  /** Delivers one frame or close either way; false when none waits. */
  step(): boolean {
    for (const wire of this.wires) {
      const { life, core, socket } = wire;
      const frame = wire.toNode.shift();
      if (frame !== undefined) {
        life.run(() => core.server.connections.message(socket, frame));
        return true;
      }
      const next = wire.toWindow.shift();
      if (next === undefined) continue;
      if (next instanceof Uint8Array) wire.handlers.onFrame(next);
      else {
        this.wires.delete(wire);
        life.run(() => core.server.connections.close(socket));
        wire.handlers.onClose(next.code, next.reason);
      }
      return true;
    }
    return false;
  }

  isQueued(): boolean {
    return [...this.wires].some((w) => w.toNode.length + w.toWindow.length);
  }

  /** A ticket, then the socket upgraded at the node and carried by a wire. */
  private async connect(handlers: Handlers): Promise<Connection> {
    const ticket = fieldOf(await this.post("/api/ws-ticket"), "ticket");
    const { life, core } = this.node();
    if (typeof ticket !== "string" || !life.alive)
      throw new ConnectError("unreachable");
    const upgraded: { data: ConnectionData | null } = { data: null };
    const headers = { "X-Manent-Launch": LAUNCH, Origin: NODE_URL };
    const url = `${NODE_URL}/ws?ticket=${ticket}`;
    const upgrade = (data: ConnectionData): boolean => {
      upgraded.data = data;
      return true;
    };
    await core.server
      .fetch(new Request(url, { headers }), { ...AT, upgrade })
      .catch(() => null);
    const { data } = upgraded;
    if (data === null || !life.alive) throw new ConnectError("unreachable");
    const wire = this.wire(life, core, data, handlers);
    life.run(() => core.server.connections.open(wire.socket));
    return {
      send(frame) {
        if (wire.open) wire.toNode.push(new Uint8Array(frame));
      },
      close: () => {
        if (!this.wires.delete(wire)) return;
        wire.open = false;
        life.run(() => core.server.connections.close(wire.socket));
      },
    };
  }

  /** A process that dies drops its sockets at once, with nothing more delivered. */
  private wire(
    life: NodeLife,
    core: NodeCore,
    data: ConnectionData,
    handlers: Handlers,
  ): Wire {
    const wire: Wire = {
      open: true,
      life,
      core,
      toNode: [],
      toWindow: [],
      handlers,
      socket: {
        data,
        bufferedBytes: 0,
        send(frame) {
          if (wire.open) wire.toWindow.push(new Uint8Array(frame));
          return "sent";
        },
        close(code, reason) {
          if (!wire.open) return;
          wire.open = false;
          wire.toWindow.push({ code, reason });
        },
      },
    };
    life.wires.add(() => {
      if (!this.wires.delete(wire)) return;
      wire.open = false;
      handlers.onClose(1006, "");
    });
    this.wires.add(wire);
    return wire;
  }
}
