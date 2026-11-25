import { describe, expect, test } from "bun:test";
import { COMMANDS } from "@manent/commands";
import type { DraftOpenResponse, VersionContent } from "@manent/sync-protocol";
import { READER_WORDS } from "@manent/ui";
import {
  blockTextOf,
  changedPageLabels,
  compareDrafts,
  draftPageWidthPx,
} from "../src/reader/reader-compare.ts";
import { createReaderRequests } from "../src/reader/reader-requests.ts";
import {
  READER_LAST_READ_KEY,
  clearPendingTap,
  readAnonLastRead,
  readCachedDraft,
  readPendingTap,
  removeCachedDraft,
  writeAnonLastRead,
  writeCachedDraft,
  writePendingTap,
} from "../src/reader/reader-storage.ts";

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function sampleContent(actionText: string): VersionContent {
  return {
    v: 1,
    schemaVersion: 1,
    engineVersion: 1,
    blocks: [
      {
        type: "block",
        attrs: { id: "block001", type: "scene_heading" },
        content: [{ type: "text", text: "INT. OFFICE - DAY" }],
      },
      {
        type: "block",
        attrs: { id: "block002", type: "action" },
        content: [{ type: "text", text: actionText }],
      },
    ],
    locks: null,
    settings: {},
    authors: {},
  };
}

function sampleDraft(
  overrides: Partial<DraftOpenResponse> = {},
): DraftOpenResponse {
  return {
    docId: "doc-1",
    sendId: "send-1",
    versionId: "ver-2",
    name: "Studio",
    sentAt: Date.UTC(2026, 10, 16, 12, 0, 0),
    content: sampleContent("Rain hits the glass."),
    watermark: "Leo Marsh",
    canComment: true,
    lastReadVersionId: "ver-1",
    ...overrides,
  };
}

describe("reader storage", () => {
  test("stores anonymous last-read map under manent.reader.lastRead and tolerates malformed data", () => {
    const storage = memoryStorage();
    expect(READER_LAST_READ_KEY).toBe("manent.reader.lastRead");
    expect(readAnonLastRead(storage, "doc-1")).toBeNull();

    writeAnonLastRead(storage, "doc-1", "ver-1");
    writeAnonLastRead(storage, "doc-2", "ver-9");
    expect(readAnonLastRead(storage, "doc-1")).toBe("ver-1");
    expect(readAnonLastRead(storage, "doc-2")).toBe("ver-9");
    expect(JSON.parse(storage.getItem(READER_LAST_READ_KEY) ?? "{}")).toEqual({
      "doc-1": "ver-1",
      "doc-2": "ver-9",
    });

    storage.setItem(READER_LAST_READ_KEY, "{not-json");
    expect(readAnonLastRead(storage, "doc-1")).toBeNull();
  });

  test("scopes offline cached drafts by token and userId so watermarked copies never leak across readers", () => {
    const storage = memoryStorage();
    const draft = sampleDraft({ watermark: "Leo Marsh" });
    const openedAt = Date.UTC(2026, 10, 16, 12, 0, 0);

    writeCachedDraft(storage, "tok-leo", "leo", openedAt, draft);
    expect(readCachedDraft(storage, "tok-leo", "leo")).toEqual({
      userId: "leo",
      openedAt,
      draft,
    });
    expect(readCachedDraft(storage, "tok-leo", "sam")).toBeNull();
    expect(readCachedDraft(storage, "tok-leo", null)).toBeNull();
  });

  test("evicts oldest cached drafts beyond the bounded cache limit", () => {
    const storage = memoryStorage();
    const base = Date.UTC(2026, 10, 1, 0, 0, 0);
    for (let i = 0; i < 10; i++) {
      writeCachedDraft(
        storage,
        `tok-${i}`,
        "leo",
        base + i * 1000,
        sampleDraft({ versionId: `ver-${i}` }),
      );
    }
    expect(readCachedDraft(storage, "tok-0", "leo")).toBeNull();
    expect(readCachedDraft(storage, "tok-1", "leo")).toBeNull();
    expect(readCachedDraft(storage, "tok-2", "leo")?.draft.versionId).toBe(
      "ver-2",
    );
    expect(readCachedDraft(storage, "tok-9", "leo")?.draft.versionId).toBe(
      "ver-9",
    );
  });

  test("keys offline cache by (userId, token) so two readers do not overwrite each other and supports eviction", () => {
    const storage = memoryStorage();
    const leoDraft = sampleDraft({ watermark: "Leo Marsh" });
    const samDraft = sampleDraft({ watermark: "Sam Okafor" });

    writeCachedDraft(storage, "shared-tok", "leo", 1000, leoDraft);
    writeCachedDraft(storage, "shared-tok", "sam", 2000, samDraft);

    expect(readCachedDraft(storage, "shared-tok", "leo")?.draft.watermark).toBe(
      "Leo Marsh",
    );
    expect(readCachedDraft(storage, "shared-tok", "sam")?.draft.watermark).toBe(
      "Sam Okafor",
    );

    removeCachedDraft(storage, "shared-tok", "leo");
    expect(readCachedDraft(storage, "shared-tok", "leo")).toBeNull();
    expect(readCachedDraft(storage, "shared-tok", "sam")?.draft.watermark).toBe(
      "Sam Okafor",
    );
  });

  test("persists and clears pending tap-to-comment targets per token in tabStorage", () => {
    const storage = memoryStorage();
    expect(readPendingTap(storage, "tok-1")).toBeNull();
    writePendingTap(storage, "tok-1", {
      blockId: "block002",
      place: { left: 120, top: 240 },
    });
    expect(readPendingTap(storage, "tok-1")).toEqual({
      blockId: "block002",
      place: { left: 120, top: 240 },
    });
    expect(readPendingTap(storage, "tok-other")).toBeNull();
    clearPendingTap(storage, "tok-1");
    expect(readPendingTap(storage, "tok-1")).toBeNull();
  });
});

describe("reader comparison and layout helpers", () => {
  test("computes changed page labels, page width and block text", () => {
    const earlier = sampleContent("Rain hits the glass.");
    const current = sampleContent("Snow covers the sill.");

    expect(changedPageLabels(earlier, earlier)).toEqual([]);
    expect(changedPageLabels(earlier, current)).toEqual(["1"]);
    const compared = compareDrafts(earlier, current);
    expect(compared?.pages).toEqual(["1"]);
    expect(compared?.comparison.entries.some((e) => e.kind === "changed")).toBe(
      true,
    );
    expect(draftPageWidthPx(current)).toBe(816);
    expect(blockTextOf(current, "block002")).toBe("Snow covers the sill.");
    expect(blockTextOf(current, "missing")).toBeNull();
  });
});

describe("reader requests", () => {
  test("opens a draft anonymously without Authorization and parses refusals", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const requests = createReaderRequests({
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const headers = new Headers(init?.headers);
        seen.push({ url, auth: headers.get("Authorization") });
        if (url === "/api/drafts/open") {
          const body = JSON.parse(String(init?.body)) as { token: string };
          if (body.token === "expired") {
            return new Response(JSON.stringify({ error: "link_expired" }), {
              status: 410,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (body.token === "not-sent") {
            return new Response(JSON.stringify({ error: "not_sent" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify(sampleDraft({ watermark: null, canComment: false })),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            versionId: "ver-1",
            name: "White production draft",
            content: sampleContent("Earlier line."),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch,
      token: () => null,
    });

    const opened = await requests.open("good-tok");
    expect(opened.ok).toBe(true);
    expect(seen[0]).toEqual({ url: "/api/drafts/open", auth: null });

    expect(await requests.open("expired")).toEqual({
      ok: false,
      code: "link_expired",
    });
    expect(await requests.open("not-sent")).toEqual({
      ok: false,
      code: "not_sent",
    });

    const since = await requests.since("good-tok", "ver-1");
    expect(since.ok).toBe(true);
    if (since.ok) expect(since.value.name).toBe("White production draft");
    expect(seen[3]?.url).toBe("/api/drafts/since?token=good-tok&since=ver-1");
  });

  test("returns unreachable when fetch throws", async () => {
    const requests = createReaderRequests({
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
      token: () => "tok-1",
    });
    expect(await requests.open("any")).toEqual({
      ok: false,
      code: "unreachable",
    });
  });
});

describe("reader command and wording", () => {
  test("history.sinceLastRead is registered and hidden from the palette", () => {
    const def = COMMANDS.find((c) => c.id === "history.sinceLastRead");
    expect(def?.label).toBe("Changes since you last read");
    expect(def?.palette).toEqual({ hidden: "reader frame only" });
  });

  test("formats changed-page sentences verbatim", () => {
    expect(READER_WORDS.pagesChangedSinceLastRead([])).toBe(
      "Nothing has changed since you last read.",
    );
    expect(READER_WORDS.pagesChangedSinceLastRead(["4"])).toBe(
      "1 page changed since you last read: p. 4.",
    );
    expect(READER_WORDS.pagesChangedSinceLastRead(["3", "12"])).toBe(
      "2 pages changed since you last read: pp. 3 and 12.",
    );
    expect(READER_WORDS.pagesChangedSinceLastRead(["3", "7", "12"])).toBe(
      "3 pages changed since you last read: pp. 3, 7 and 12.",
    );
    expect(READER_WORDS.chooseToComment("Studio")).toBe(
      "Choose who you are to comment on 'Studio'.",
    );
    expect(READER_WORDS.offlineCopy("Mon 16 Nov")).toBe(
      "Offline — showing the copy you opened Mon 16 Nov",
    );
  });
});
