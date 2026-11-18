// Which workspace may import which, one row per workspace. Given to tools/check-boundaries.ts.

export interface WorkspaceRule {
  layer: 0 | 1 | 2 | 3 | 4 | "tooling";
  runtime: "pure" | "browser" | "bun";
  /** product: by any workspace whose row lists it. tests: by test code and tooling only. never: apps, bench, e2e, tools. */
  importable: "product" | "tests" | "never";
  internal: readonly string[] | "*";
  /** A subset of `internal`: only `import type` may cross. */
  typesOnly: readonly string[];
  /** A list for a pure row; "declared" (whatever the manifest declares) otherwise. */
  external: readonly string[] | "declared";
  /** Globals a pure row forbids beyond the shared list. */
  forbiddenGlobals: readonly string[];
}

export interface Zone {
  workspace: string;
  /** Workspace-relative path prefixes, such as "src/http/", that are exempt. */
  only: readonly string[];
  /** Globals no product file outside `only` may name. */
  globals: readonly string[];
  /** Packages no product file outside `only` may import other than with `import type`. */
  values: readonly string[];
}

export interface BoundaryRules {
  workspaces: Readonly<Record<string, WorkspaceRule>>;
  /** An external or built-in module, and the only workspaces whose product code may import it. */
  restrictedExternal: Readonly<Record<string, readonly string[]>>;
  forbiddenGlobals: readonly string[];
  zones: readonly Zone[];
}

export const RULES: BoundaryRules = {
  workspaces: {
    schema: {
      layer: 0,
      runtime: "pure",
      importable: "product",
      internal: [],
      typesOnly: [],
      external: ["prosemirror-model"],
      forbiddenGlobals: [],
    },
    settings: {
      layer: 0,
      runtime: "pure",
      importable: "product",
      internal: [],
      typesOnly: [],
      external: [],
      forbiddenGlobals: [],
    },
    "sync-protocol": {
      layer: 0,
      runtime: "pure",
      importable: "product",
      internal: [],
      typesOnly: [],
      external: ["lib0"],
      forbiddenGlobals: [],
    },
    perf: {
      layer: 0,
      runtime: "pure",
      importable: "product",
      internal: [],
      typesOnly: [],
      external: [],
      forbiddenGlobals: [],
    },
    pagination: {
      layer: 1,
      runtime: "pure",
      importable: "product",
      internal: ["schema"],
      typesOnly: ["schema"],
      external: [],
      forbiddenGlobals: [],
    },
    revisions: {
      layer: 1,
      runtime: "pure",
      importable: "product",
      internal: ["schema", "pagination"],
      typesOnly: [],
      external: [
        "prosemirror-changeset",
        "prosemirror-model",
        "prosemirror-transform",
      ],
      forbiddenGlobals: [],
    },
    crdt: {
      layer: 1,
      runtime: "pure",
      importable: "product",
      internal: ["schema"],
      typesOnly: [],
      external: ["yjs", "y-protocols", "lib0"],
      forbiddenGlobals: [],
    },
    formats: {
      layer: 1,
      runtime: "browser",
      importable: "product",
      internal: ["schema", "pagination", "revisions"],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    "sync-client": {
      layer: 2,
      runtime: "pure",
      importable: "product",
      internal: ["sync-protocol", "crdt", "revisions", "schema", "perf"],
      typesOnly: [],
      external: [],
      forbiddenGlobals: [
        "WebSocket",
        "BroadcastChannel",
        "fetch",
        "setTimeout",
        "setInterval",
        "Date",
      ],
    },
    "client-web": {
      layer: 2,
      runtime: "browser",
      importable: "product",
      internal: ["sync-client", "sync-protocol", "perf"],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    storage: {
      layer: 2,
      runtime: "bun",
      importable: "product",
      internal: ["perf"],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    "server-core": {
      layer: 2,
      runtime: "bun",
      importable: "product",
      internal: [
        "storage",
        "sync-protocol",
        "crdt",
        "schema",
        "revisions",
        "pagination",
        "formats",
        "settings",
        "perf",
      ],
      typesOnly: ["storage"],
      external: "declared",
      forbiddenGlobals: [],
    },
    "local-node": {
      layer: 2,
      runtime: "bun",
      importable: "product",
      internal: [
        "server-core",
        "sync-client",
        "storage",
        "sync-protocol",
        "crdt",
        "schema",
        "perf",
      ],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    "crdt-binding": {
      layer: 3,
      runtime: "browser",
      importable: "product",
      internal: ["crdt", "editor", "schema"],
      typesOnly: ["editor"],
      external: "declared",
      forbiddenGlobals: [],
    },
    editor: {
      layer: 3,
      runtime: "browser",
      importable: "product",
      internal: ["schema", "pagination", "revisions", "settings", "perf"],
      typesOnly: ["settings"],
      external: "declared",
      forbiddenGlobals: [],
    },
    commands: {
      layer: 3,
      runtime: "pure",
      importable: "product",
      internal: ["settings"],
      typesOnly: [],
      external: [],
      forbiddenGlobals: [],
    },
    ui: {
      layer: 4,
      runtime: "browser",
      importable: "product",
      internal: ["commands", "settings", "perf"],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    demo: {
      layer: 4,
      runtime: "browser",
      importable: "product",
      internal: [
        "schema",
        "crdt",
        "sync-protocol",
        "sync-client",
        "server-core",
      ],
      typesOnly: ["server-core"],
      external: "declared",
      forbiddenGlobals: [],
    },
    web: {
      layer: 4,
      runtime: "browser",
      importable: "never",
      internal: [
        "ui",
        "commands",
        "settings",
        "editor",
        "crdt-binding",
        "crdt",
        "client-web",
        "sync-client",
        "sync-protocol",
        "schema",
        "pagination",
        "revisions",
        "formats",
        "perf",
        "demo",
      ],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    server: {
      layer: 4,
      runtime: "bun",
      importable: "never",
      internal: [
        "server-core",
        "storage",
        "demo",
        "crdt",
        "sync-client",
        "sync-protocol",
        "schema",
        "pagination",
        "revisions",
        "settings",
        "formats",
        "perf",
      ],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    desktop: {
      layer: 4,
      runtime: "bun",
      importable: "never",
      internal: [
        "local-node",
        "server-core",
        "storage",
        "demo",
        "sync-protocol",
        "perf",
      ],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    testkit: {
      layer: "tooling",
      runtime: "bun",
      importable: "tests",
      internal: "*",
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    bench: {
      layer: "tooling",
      runtime: "bun",
      importable: "never",
      internal: "*",
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    e2e: {
      layer: "tooling",
      runtime: "bun",
      importable: "never",
      internal: "*",
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    tools: {
      layer: "tooling",
      runtime: "bun",
      importable: "never",
      internal: "*",
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
  },
  restrictedExternal: {
    yjs: ["crdt"],
    "y-protocols": ["crdt"],
    "y-prosemirror": ["crdt-binding"],
    electrobun: ["desktop"],
    "bun:sqlite": ["storage", "local-node"],
    "prosemirror-model": [
      "schema",
      "revisions",
      "editor",
      "crdt-binding",
      "e2e",
    ],
    "prosemirror-state": ["editor", "crdt-binding", "e2e"],
    "prosemirror-view": ["editor", "crdt-binding", "e2e"],
    "prosemirror-transform": ["revisions", "editor"],
    "prosemirror-keymap": ["editor"],
    "prosemirror-commands": ["editor"],
    "prosemirror-inputrules": ["editor"],
    "prosemirror-gapcursor": ["editor"],
    "prosemirror-search": ["editor"],
    "prosemirror-changeset": ["revisions"],
  },
  forbiddenGlobals: [
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
  ],
  zones: [
    {
      workspace: "server-core",
      only: ["src/http/"],
      globals: ["Bun"],
      values: [],
    },
    {
      workspace: "web",
      only: ["src/editor-host/"],
      globals: [],
      values: ["@manent/editor", "@manent/crdt-binding"],
    },
  ],
};
