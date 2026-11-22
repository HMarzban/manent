import { afterAll, expect, test } from "bun:test";
import { createTempTrees } from "@manent/testkit";
import { readServerEnv } from "../src/env.ts";
import { startServer } from "../src/main.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
const key = (n: number): string => n.toString(16).padStart(32, "0");

const SCRIPT = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: "heading-1", type: "scene_heading" },
          content: [{ type: "text", text: "INT. FERRY DECK - NIGHT" }],
        },
        {
          type: "block",
          attrs: { id: "action-1-1", type: "action" },
          content: [{ type: "text", text: "Gulls wheel over the wake." }],
        },
      ],
    },
  ],
};

const trees = createTempTrees("manent-production-start-");
afterAll(() => trees.removeAll());

const fieldOf = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

test(
  "the server draws an issued packet with the script font",
  async () => {
    const dataDir = await trees.tree({});
    const env = { ...readServerEnv({ MANENT_DEMO: "1" }), port: 0, dataDir };
    const server = await startServer(env);
    const [url] = server.urls;
    const signedIn: unknown = await (
      await fetch(`${url}/api/sign-in`, {
        method: "POST",
        body: JSON.stringify({ userId: "priya" }),
      })
    ).json();
    const headers = { Authorization: `Bearer ${fieldOf(signedIn, "token")}` };
    const post = (path: string, body: unknown) =>
      fetch(`${url}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    try {
      await post("/api/docs", {
        docId: DOC,
        kind: "script",
        home: `project:${PROJECT}`,
      });
      await post("/api/versions/upload", {
        docId: DOC,
        version: {
          id: "uploaded-1",
          kind: "device",
          name: null,
          deviceId: "device-1",
          content: SCRIPT,
          schemaVersion: 1,
        },
      });
      await post("/api/versions/restore", {
        docId: DOC,
        key: key(1),
        versionId: "uploaded-1",
        scope: { kind: "script" },
      });
      await post("/api/production/lock", {
        docId: DOC,
        key: key(2),
        numbering: "suffix",
        colourOrder: "standard",
        lockedOn: "2026-10-27",
      });
      const issued: unknown = await (
        await post("/api/production/issue", {
          docId: DOC,
          key: key(3),
          expectedOrdinal: 1,
          what: "full",
          pages: ["1"],
          files: ["pdf_marked"],
          tint: false,
          recipientUserIds: [],
          memo: "",
          issuedOn: "2026-11-16",
        })
      ).json();
      const issueId = fieldOf(fieldOf(issued, "issue"), "issueId");
      const response = await post("/api/production/file", {
        docId: DOC,
        issueId,
        file: "pdf_marked",
      });
      const bytes = new TextDecoder("latin1").decode(
        await response.arrayBuffer(),
      );
      expect([
        response.status,
        response.headers.get("content-type"),
        bytes.slice(0, 7),
        bytes.includes("CourierPrime"),
      ]).toEqual([200, "application/pdf", "%PDF-1.", true]);
    } finally {
      await server.stop();
    }
  },
  { timeout: 30_000 },
);
