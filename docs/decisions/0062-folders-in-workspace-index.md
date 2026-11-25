# 0062. Workspace folders live in the workspace index and hold projects

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

A production studio workspace holds dozens of active, developing and archived projects across film, television, live shows and audio or game work. Writers and producers need nested folders in the Library and `folder:` filtering in search without duplicating folder hierarchies inside every project index.

## Options considered

- Store folder metadata inside each project's own index document. Rejected: listing the Library's folder tree or renaming a folder would require opening every project index in the workspace.
- Put individual scripts directly into workspace folders rather than projects. Rejected: breaks Manent's project model where companion outlines, episodes, rundowns and settings travel together under one project.
- Store folders in the workspace index's `folders` map and assign each project an optional `folderId` in `projects`. Chosen.

## Decision

Workspace folders live in the workspace index's `folders` map (`{ name, parentId, createdAt, createdByUserId }`), and projects sit at the top level (`folderId: null`) or inside a folder (`folderId` referencing a key in `folders`). Moving a project between folders updates its `projects` entry in one transaction and preserves all existing project fields.

## Consequences and trade-offs

- The Library renders the entire workspace folder tree from the single workspace index it already opens, and search resolves ancestor folder chains in one pass over the same index.
- Folders organise projects rather than mixing standalone scripts across project boundaries; scripts within a project continue to use the project's own organisation (episodes, rundowns, companion outlines).
- Very deep or concurrent folder reparenting relies on cycle-safe ancestor traversal when computing search folder filters.

## Revisit when

Studios need per-folder access permissions distinct from workspace and project roles, or workspaces grow so large that a single workspace index exceeds sync budgets.
