// A window's setting request on a relayed script, as its person's line carries it: sent upstream
// once the line is level with the room, and refused back to that person's editors.
import { encodeUpstreamRefused } from "@manent/sync-client";
import type { Line, SetItem } from "./follow.ts";

const UTF8 = new TextDecoder("utf-8", { fatal: true });

function readValue(bytes: Uint8Array): { value: unknown } | null {
  try {
    return { value: JSON.parse(UTF8.decode(bytes)) };
  } catch {
    // a value that is not UTF-8 JSON is refused as the cloud would refuse it
    return null;
  }
}

export interface SettingRequests {
  /** Through the line's handle once the line is ready; queued on the line until then. */
  send(line: Line, item: SetItem): void;
  /** Answered to the person's editors of the document with `message`. */
  refuse(docId: string, item: SetItem, message: string): void;
}

/** `onRefused` is given the data of a CONTROL `upstream_refused`. */
export function createSettingRequests(options: {
  onRefused(docId: string, userId: string, data: Uint8Array): void;
}): SettingRequests {
  function refuse(docId: string, item: SetItem, message: string): void {
    const data = encodeUpstreamRefused(item.clientSeq, message);
    options.onRefused(docId, item.userId, data);
  }
  return {
    send(line, item) {
      if (line.handle === null || !line.ready)
        return void line.queued.push(item);
      const read = readValue(item.value);
      if (read === null) return refuse(line.docId, item, "bad_value");
      line.handle.setSetting(item.key, read.value);
      line.asked.push(item);
    },
    refuse,
  };
}
