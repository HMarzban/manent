import { expect, test } from "bun:test";
import {
  fetchCanSendPrompter,
  lookupVersionCreatedAt,
  postPrompterSend,
} from "../src/prompter/prompter-http.ts";

test("prompter HTTP requests use an injected fetch implementation", async () => {
  const requests: {
    url: string;
    method: string;
    auth: string | null;
    body: string | null;
  }[] = [];

  const fakeFetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      method: init?.method ?? "GET",
      auth: headers.get("Authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    if (url === "/api/docs/describe") {
      return new Response(
        JSON.stringify({ capabilities: ["send_to_prompter"] }),
        { status: 200 },
      );
    }
    if (url === "/api/prompter/send") {
      return new Response(
        JSON.stringify({
          rowId: "row-1",
          storyId: "story-1",
          versionId: "ver-2",
          sentAt: 1_700_000_005_000,
          senderUserId: "ana",
        }),
        { status: 200 },
      );
    }
    if (url === "/api/versions?docId=story-1") {
      return new Response(
        JSON.stringify({
          versions: [{ id: "ver-2", createdAt: 1_700_000_002_000 }],
        }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  const canSend = await fetchCanSendPrompter("rundown-1", "tok-1", fakeFetch);
  const sendOutcome = await postPrompterSend(
    "send",
    { docId: "rundown-1", rowId: "row-1", key: "req-1" },
    "tok-1",
    fakeFetch,
  );
  const createdAt = await lookupVersionCreatedAt(
    "story-1",
    "ver-2",
    "tok-1",
    fakeFetch,
  );

  expect(canSend).toBe(true);
  expect(sendOutcome).toEqual({
    ok: true,
    response: {
      rowId: "row-1",
      storyId: "story-1",
      versionId: "ver-2",
      sentAt: 1_700_000_005_000,
      senderUserId: "ana",
    },
  });
  expect(createdAt).toBe(1_700_000_002_000);
  expect(requests).toEqual([
    {
      url: "/api/docs/describe",
      method: "POST",
      auth: "Bearer tok-1",
      body: JSON.stringify({ docId: "rundown-1" }),
    },
    {
      url: "/api/prompter/send",
      method: "POST",
      auth: "Bearer tok-1",
      body: JSON.stringify({
        docId: "rundown-1",
        rowId: "row-1",
        key: "req-1",
      }),
    },
    {
      url: "/api/versions?docId=story-1",
      method: "GET",
      auth: "Bearer tok-1",
      body: null,
    },
  ]);
});
