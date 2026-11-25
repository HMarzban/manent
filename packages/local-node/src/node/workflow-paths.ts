// The paths of the requests the node sends on to the cloud for a script it relays, one per line.

interface WorkflowPath {
  /** "exact": the path itself; "prefix": any path starting with it. */
  match: "exact" | "prefix";
  path: string;
}

export const WORKFLOW_PATHS: readonly WorkflowPath[] = [
  { match: "exact", path: "/api/versions" },
  { match: "prefix", path: "/api/versions/" },
  { match: "prefix", path: "/api/production/" },
  { match: "prefix", path: "/api/drafts/" },
  { match: "prefix", path: "/api/private/" },
  { match: "prefix", path: "/api/share/" },
  { match: "prefix", path: "/api/driver/" },
  { match: "prefix", path: "/api/prompter/" },
];
