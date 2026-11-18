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
    pagination: {
      layer: 1,
      runtime: "pure",
      importable: "product",
      internal: [],
      typesOnly: [],
      external: [],
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
    revisions: {
      layer: 1,
      runtime: "pure",
      importable: "product",
      internal: ["schema", "pagination"],
      typesOnly: [],
      external: ["prosemirror-changeset"],
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
    "sync-protocol": {
      layer: 0,
      runtime: "pure",
      importable: "product",
      internal: ["crdt"],
      typesOnly: ["crdt"],
      external: ["lib0"],
      forbiddenGlobals: [],
    },
    "sync-client": {
      layer: 2,
      runtime: "browser",
      importable: "product",
      internal: ["sync-protocol", "crdt", "revisions", "perf"],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    storage: {
      layer: 2,
      runtime: "bun",
      importable: "product",
      internal: ["sync-protocol"],
      typesOnly: [],
      external: "declared",
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
        "perf",
      ],
      typesOnly: [],
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
        "perf",
      ],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    editor: {
      layer: 3,
      runtime: "browser",
      importable: "product",
      internal: ["schema", "pagination", "revisions", "crdt", "perf"],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    ui: {
      layer: 4,
      runtime: "browser",
      importable: "product",
      internal: ["perf"],
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    testkit: {
      layer: "tooling",
      runtime: "bun",
      importable: "product",
      internal: "*",
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    web: {
      layer: 4,
      runtime: "browser",
      importable: "never",
      internal: "*",
      typesOnly: ["testkit"],
      external: "declared",
      forbiddenGlobals: [],
    },
    server: {
      layer: 4,
      runtime: "bun",
      importable: "never",
      internal: "*",
      typesOnly: [],
      external: "declared",
      forbiddenGlobals: [],
    },
    desktop: {
      layer: 4,
      runtime: "bun",
      importable: "never",
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
    "y-prosemirror": ["editor"],
    electrobun: ["desktop"],
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
  zones: [],
};
