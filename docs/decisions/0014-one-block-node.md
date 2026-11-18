# 0014. One block node whose element is an attribute

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

A script is a sequence of elements: scene headings, action, character cues, dialogue, transitions, and the elements of the other formats. Writers change an element all the time, often while a collaborator is typing in the same block. The CRDT's ProseMirror binding cannot change the type of a node in place: to it, a node of another type is a deletion followed by an insertion.

## Options considered

- One node type per element. Rejected: changing an element would delete the block and insert a new one, and whatever someone else was typing into it at that moment would be lost.
- One `block` node that carries its element in an attribute. Chosen.

## Decision

The schema in `packages/schema/src/schema.ts` has a single `block` node of inline text, with the same marks allowed everywhere. Its element is the stored `type` attribute. Changing an element changes that attribute alone, and the block keeps its ID (decision 0016). An element this build does not know is drawn as a general block and kept, never dropped.

## Consequences and trade-offs

- Concurrent typing survives an element change.
- Every attribute has a default, so a merge cannot produce a block the schema refuses.
- The schema cannot express content rules that differ by element. Those live in editor commands and in validation instead, and the view draws each element from the attribute.

## Revisit when

The CRDT binding in use can change a node's type in place, and per-element content rules have become worth enforcing in the schema.
