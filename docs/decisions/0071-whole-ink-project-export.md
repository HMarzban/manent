# 0071. Whole Ink projects export as one concatenated file in Library order

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

An interactive narrative project in Manent can span multiple Ink documents in one project. Game engines and external Ink tools expect either a compiled `.json` story or a single self-contained `.ink` source file that compiles without chasing relative `INCLUDE` paths on disk.

## Options considered

- Export a zip archive containing separate `.ink` files with generated `INCLUDE` directives. Rejected: requires unpacking and matching directory layouts before passing the source to `inklecate` or a game engine.
- Export only the currently open Ink document with no whole-project `.ink` export. Rejected: forces writers with multi-document Ink projects to concatenate chapters by hand.
- Concatenate every non-trashed Ink document of the project into one `.ink` file in Library order, separating each document with a `// <title>` comment header. Chosen.

## Decision

Exporting a whole Ink project writes one concatenated `.ink` file (`packages/formats/src/`) ordered in Library order, prefixing each document's source with a `// <title>` comment so sections remain identifiable while the combined file compiles directly as a single Ink source. Individual Ink documents continue to export as compiled Ink JSON as well.

## Consequences and trade-offs

- Writers and game engineers can drop one exported `.ink` file directly into an external compiler or game repository without broken `INCLUDE` paths.
- Authors must keep top-level knot names distinct across Ink documents in the same project so concatenation does not introduce duplicate knot names.

## Revisit when

Multi-file Ink projects rely heavily on explicit `INCLUDE` trees or per-file build pipelines that prefer a zip directory layout alongside the single-file export.
