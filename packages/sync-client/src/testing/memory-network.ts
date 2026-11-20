// A network in memory between clients and one server, delivering one queued frame or close
// at a time and only when a test steps it, with cuts, refused sessions and faults on request.
import { encodeReplayUpdates } from "@manent/sync-protocol";
import type {
  ReplayRefusal,
  ReplayRequest,
  ReplayResponse,
} from "@manent/sync-protocol";
import { ConnectError } from "../ports/ports.ts";
import type { Transport } from "../ports/ports.ts";

/** The server's side of one connection. */
export interface ServerEnd {
  readonly userId: string;
  send(frame: Uint8Array): void;
  close(code: number, reason: string): void;
  onFrame: ((frame: Uint8Array) => void) | null;
  onClose: ((code: number, reason: string) => void) | null;
}

type CreateResult = { ok: true } | { ok: false; code: "forbidden" | "deleted" };

export interface MemoryNetwork {
  /** Null: nobody is signed in; every request rejects ConnectError("sign_in") and reaches no server. */
  transport(userId: string | null): Transport;
  serve(handlers: {
    connected(end: ServerEnd): void;
    createDocument(
      userId: string,
      request: { docId: string; kind: string; home: string },
    ): CreateResult;
    /** Absent, a replay rejects ConnectError("unreachable"). */
    replay?(
      userId: string,
      request: ReplayRequest,
    ): Promise<
      | { ok: true; response: ReplayResponse }
      | { ok: false; code: ReplayRefusal }
    >;
  }): void;
  /** While cut, requests reject "unreachable", and every open connection closes with 1006. */
  partition(cut: boolean): void;
  /** Connects reject "sign_in", as for a session that expired. */
  refuseSessions(refuse: boolean): void;
  /** The chance, per frame, of delivering it twice, or after the next frame of its connection. */
  faults(plan: { duplicate?: number; swap?: number }): void;
  /** Delivers one queued frame or close, of the connection `random` picks; false when nothing is queued. */
  step(): boolean;
  queued(): number;
}

type Side = "client" | "server";

type Delivery =
  | { kind: "frame"; to: Side; frame: Uint8Array; late: boolean }
  | { kind: "close"; to: Side | "both"; code: number; reason: string };

interface ClientHandlers {
  onFrame(frame: Uint8Array): void;
  onClose(code: number, reason: string): void;
}

/** One connection: what waits to be delivered on it, in the order it was sent. */
interface Wire {
  open: boolean;
  queue: Delivery[];
  client: ClientHandlers;
  end: ServerEnd;
}

type Serve = Parameters<MemoryNetwork["serve"]>[0];

interface Net {
  random: () => number;
  server: Serve | null;
  wires: Set<Wire>;
  cut: boolean;
  refusing: boolean;
  duplicate: number;
  swap: number;
}

/** A frame that rolled `late` waits behind the next frame sent on its connection. */
function enqueue(net: Net, wire: Wire, to: Side, frame: Uint8Array): void {
  if (!wire.open) return;
  const copies = net.duplicate > 0 && net.random() < net.duplicate ? 2 : 1;
  for (let i = 0; i < copies; i++) {
    const tail = wire.queue.at(-1);
    const delivery: Delivery = {
      kind: "frame",
      to,
      frame: new Uint8Array(frame),
      late: false,
    };
    if (tail?.kind === "frame" && tail.late) {
      tail.late = false;
      wire.queue.splice(wire.queue.length - 1, 0, delivery);
      continue;
    }
    delivery.late = net.swap > 0 && net.random() < net.swap;
    wire.queue.push(delivery);
  }
}

/** What waited for the side that closes is dropped; the other side hears the close after what it was sent. */
function closeFrom(wire: Wire, from: Side, code: number, reason: string): void {
  if (!wire.open) return;
  wire.open = false;
  wire.queue = wire.queue.filter((d) => d.kind === "frame" && d.to !== from);
  wire.queue.push({
    kind: "close",
    to: from === "client" ? "server" : "client",
    code,
    reason,
  });
}

function deliver(net: Net, wire: Wire, delivery: Delivery): void {
  if (delivery.kind === "frame") {
    if (delivery.to === "client") wire.client.onFrame(delivery.frame);
    else wire.end.onFrame?.(delivery.frame);
    return;
  }
  net.wires.delete(wire);
  wire.queue = [];
  if (delivery.to !== "server")
    wire.client.onClose(delivery.code, delivery.reason);
  if (delivery.to !== "client")
    wire.end.onClose?.(delivery.code, delivery.reason);
}

/** The server, for a signed-in user it is not cut off from. */
function reach(net: Net, userId: string | null): [Serve, string] {
  if (userId === null || net.refusing) throw new ConnectError("sign_in");
  if (net.cut || net.server === null) throw new ConnectError("unreachable");
  return [net.server, userId];
}

function open(net: Net, userId: string, client: ClientHandlers): Wire {
  const wire: Wire = {
    open: true,
    queue: [],
    client,
    end: {
      userId,
      send: (frame) => enqueue(net, wire, "client", frame),
      close: (code, reason) => closeFrom(wire, "server", code, reason),
      onFrame: null,
      onClose: null,
    },
  };
  net.wires.add(wire);
  return wire;
}

function transportOf(net: Net, userId: string | null): Transport {
  return {
    async connect(handlers) {
      const [server, user] = reach(net, userId);
      const wire = open(net, user, handlers);
      server.connected(wire.end);
      return {
        send: (frame) => enqueue(net, wire, "server", frame),
        close: (code, reason) => closeFrom(wire, "client", code, reason),
      };
    },
    async createDocument(request) {
      const [server, user] = reach(net, userId);
      return server.createDocument(user, request);
    },
    async replay(request) {
      const [server, user] = reach(net, userId);
      if (server.replay === undefined) throw new ConnectError("unreachable");
      const updates = encodeReplayUpdates(request.updates);
      return server.replay(user, { ...request, updates });
    },
  };
}

/** Nothing is delivered inside `send`: a frame waits until `step()`. A cut loses what was queued for the connections it closes. */
export function createMemoryNetwork(options: {
  random: () => number;
}): MemoryNetwork {
  const net: Net = {
    random: options.random,
    server: null,
    wires: new Set(),
    cut: false,
    refusing: false,
    duplicate: 0,
    swap: 0,
  };
  return {
    transport: (userId) => transportOf(net, userId),
    serve(handlers) {
      net.server = handlers;
    },
    partition(cut) {
      net.cut = cut;
      if (!cut) return;
      for (const wire of net.wires) {
        wire.open = false;
        wire.queue = [{ kind: "close", to: "both", code: 1006, reason: "" }];
      }
    },
    refuseSessions(refuse) {
      net.refusing = refuse;
    },
    faults(plan) {
      net.duplicate = plan.duplicate ?? 0;
      net.swap = plan.swap ?? 0;
    },
    step() {
      const busy = [...net.wires].filter((wire) => wire.queue.length > 0);
      if (busy.length === 0) return false;
      const wire = busy[Math.floor(net.random() * busy.length)]!;
      deliver(net, wire, wire.queue.shift()!);
      return true;
    },
    queued: () =>
      [...net.wires].reduce((sum, wire) => sum + wire.queue.length, 0),
  };
}
