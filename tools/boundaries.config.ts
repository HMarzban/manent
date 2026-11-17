// Which workspace may import which. Read by tools/check-boundaries.ts.

/** The internal packages each workspace may import. */
export const INTERNAL: Record<string, readonly string[] | "*"> = {
  schema: [],
  pagination: [],
  perf: [],
  revisions: ["schema", "pagination"],
  crdt: ["schema"],
  "sync-protocol": ["crdt"],
  "sync-client": ["sync-protocol", "crdt", "revisions", "perf"],
  storage: ["sync-protocol"],
  formats: ["schema", "pagination", "revisions"],
  "server-core": [
    "storage",
    "sync-protocol",
    "crdt",
    "schema",
    "revisions",
    "pagination",
    "formats",
    "perf",
  ],
  "local-node": [
    "server-core",
    "sync-client",
    "storage",
    "sync-protocol",
    "crdt",
    "perf",
  ],
  editor: ["schema", "pagination", "revisions", "crdt", "perf"],
  ui: ["perf"],
  // any package, never an app
  testkit: "*",
  web: "*",
  server: "*",
  desktop: "*",
  bench: "*",
  e2e: "*",
  tools: "*",
};

/** Pairs where `from` may import only types from `to`. */
export const TYPES_ONLY: readonly (readonly [from: string, to: string])[] = [
  ["sync-protocol", "crdt"],
  ["web", "testkit"],
];

export const NEVER_IMPORTED = [
  "web",
  "server",
  "desktop",
  "bench",
  "e2e",
  "tools",
] as const;

/** Packages that touch neither the DOM nor Bun. */
export const PURE = [
  "schema",
  "pagination",
  "revisions",
  "crdt",
  "sync-protocol",
  "perf",
] as const;

/** The only external packages a pure package may import. */
export const PURE_EXTERNAL: Record<(typeof PURE)[number], readonly string[]> = {
  schema: ["prosemirror-model"],
  pagination: [],
  revisions: ["prosemirror-changeset"],
  crdt: ["yjs", "y-protocols", "lib0"],
  "sync-protocol": ["lib0"],
  perf: [],
};

/** Workspaces that run in a browser. */
export const NO_BUN = [
  ...PURE,
  "sync-client",
  "formats",
  "editor",
  "ui",
  "web",
] as const;

/** External packages that only the listed workspaces may import. */
export const RESTRICTED_EXTERNAL: Record<string, readonly string[]> = {
  yjs: ["crdt"],
  "y-protocols": ["crdt"],
  "y-prosemirror": ["editor"],
  electrobun: ["desktop"],
};

/** Globals that PURE sources must not use. */
export const FORBIDDEN_GLOBALS = [
  "Bun",
  "process",
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "requestAnimationFrame",
  "HTMLElement",
] as const;
