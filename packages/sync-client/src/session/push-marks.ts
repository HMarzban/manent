// The product mark of each push's round trip: from sending it to the ACK that answers it.
// A push refused for good, or lost with its connection, records nothing.
import { markEnd, markStart } from "@manent/perf";
import { CODE } from "@manent/sync-protocol";
import type { DocumentMessage, Message } from "@manent/sync-protocol";
import { readRefusal } from "./refusals.ts";

type Send = (message: Message) => void;

/** The `markStart()` token of each push in flight on the connection, by `clientSeq`. */
export class PushMarks {
  private readonly started = new Map<number, number>();

  /** `send`, starting the time of each push it sends; a push sent again starts again. */
  timed(send: Send): Send {
    return (message) => {
      if (message.type === "PUSH")
        this.started.set(message.clientSeq, markStart());
      send(message);
    };
  }

  /** An ACK records every push at or under its `clientSeq`; a node's refusal of one push drops its time. */
  answered(message: DocumentMessage): void {
    if (message.type === "ACK") return this.acknowledged(message.clientSeq);
    const refusal =
      message.type === "CONTROL" && message.kind === "upstream_refused"
        ? readRefusal(message.data)
        : null;
    if (refusal !== null) this.started.delete(refusal.clientSeq);
  }

  /** Every ERROR but the refusal of one setting ends the pushes in flight, as the exchange does. */
  ended(message: Extract<Message, { type: "ERROR" }>): void {
    if (message.code !== CODE.SETTING_REFUSED || message.clientSeq === null)
      this.started.clear();
  }

  /** The connection closed: nothing sent on it is answered. */
  dropped(): void {
    this.started.clear();
  }

  private acknowledged(through: number): void {
    for (const [clientSeq, token] of this.started) {
      if (clientSeq > through) continue;
      markEnd("sync.ack", token);
      this.started.delete(clientSeq);
    }
  }
}
