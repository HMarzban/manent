# 0045. An outline uses General prose and scene headings with synopses as beats

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Episodes, films and stage plays can keep a companion outline document (`kind: "outline"`) opened beside the script and used to start a script directly. Defining a bespoke outline schema would duplicate editor bindings, CRDT mapping, validation, export and version history for a document whose structure is already prose grouped into beats.

## Options considered

- Create a separate ProseMirror schema and block node types specifically for outlines (such as dedicated beat and prose nodes). Rejected: every layer—schema validation, CRDT mapping, pagination, editor keymaps, export and history—would have to maintain a second document model.
- Store the outline as plain Markdown text inside the project index. Rejected: an outline needs real-time collaborative editing, comments, version history and structured beats that turn cleanly into scenes when starting a script.
- Represent an outline with the existing script block schema: prose blocks are `general`, and each Beat is a scene heading block paired with its synopsis. Chosen.

## Decision

An outline document is a normal CRDT block document (`kind: "outline"`) using Manent's existing block schema: prose paragraphs are `general` blocks, and each Beat is a `scene_heading` block together with its `synopsis` block. Starting a script from an outline reads those beats directly into the new script's opening scenes and synopses.

## Consequences and trade-offs

- Outlines inherit collaborative editing, offline sync, undo, history, find and replace, and export with no second schema or validator.
- Moving from an outline to a first draft is a direct, lossless copy of scene headings and synopses rather than a heuristic text conversion.
- Outline-specific structure is expressed through conventions over existing block elements rather than dedicated outline-only node types.

## Revisit when

Outlines need structural elements (such as nested multi-column beat tables or collapsible sub-beats) that cannot be represented cleanly with existing block elements.
