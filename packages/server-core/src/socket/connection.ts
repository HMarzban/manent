// The seam between a transport's sockets and the server's connection rules.

/** Marks a value as connection data, which only this package creates. */
export const connectionBrand: unique symbol = Symbol("connection");

/** What a socket carries. Opaque outside this package: an adapter stores it and hands it back. */
export interface ConnectionData {
  readonly [connectionBrand]: true;
}

/** One socket as a transport presents it. */
export interface Connection {
  readonly data: ConnectionData;
  /** Bytes queued and not yet written. */
  readonly bufferedBytes: number;
  send(frame: Uint8Array): "sent" | "backpressure" | "dropped";
  close(code: number, reason: string): void;
}

/** What a transport calls for each event of a socket it upgraded. */
export interface ConnectionHandler {
  open(connection: Connection): void;
  message(connection: Connection, frame: Uint8Array | string): void;
  drain(connection: Connection): void;
  close(connection: Connection): void;
  /** The largest frame a transport may accept. */
  readonly maxFrameBytes: number;
}
