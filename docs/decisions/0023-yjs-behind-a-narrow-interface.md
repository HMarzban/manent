# 0023. Yjs 13 behind a narrow interface that one package owns

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

With a CRDT chosen (decision 0022), a library had to be picked, knowing the choice may change within the product's life: a new major version of Yjs is in pre-release and other libraries are moving too. If the library's types spread through the editor, the server and storage, changing it would touch everything.

## Options considered

- The Yjs 14 pre-release with its new ProseMirror binding. Rejected for now: both were pre-release when this was decided, and Yjs 13 clients cannot read every Yjs 14 update, so moving to it means migrating every stored document and installed client, with no way back.
- Loro. Rejected: its ProseMirror binding, too, swaps in an entire new document for each remote change, so it would not remove the binding's largest cost.
- Automerge. Rejected: its ProseMirror binding maps only a subset of schemas and calls itself beta.
- Stable Yjs 13 with its stable binding. Chosen.

## Decision

Yjs 13.6.33 with y-prosemirror 1.3.7. Only `@manent/crdt` imports `yjs` and `y-protocols`, only `@manent/crdt-binding` imports `y-prosemirror`, and the editor imports neither; `tools/boundaries.config.ts` enforces each of these. Versions, comparison, restore and revisions work on plain documents and block IDs, never on Yjs types.

## Consequences and trade-offs

- Replacing the library touches two packages, not the whole codebase.
- The limit: the binding is a second place tied to Yjs, and `crdt` hands it one Yjs type (`yXmlFragmentForBinding`), so a new CRDT would mean a new binding as well.
- The 1.x binding replaces the whole document on each remote change, so a remote update costs time in proportion to the document. Remote updates are to be merged and applied at most once per frame to contain that.

## Revisit when

Yjs 14 and its binding are stable and pass our tests, or typing alongside remote editors misses its budget with the 1.x binding.
