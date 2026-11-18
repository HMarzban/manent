# 0013. Plain ProseMirror, without a wrapper framework

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

The editor needs exact control of the document model, decorations for pagination, and keyboard rules of its own for script elements. ProseMirror is the editing toolkit underneath; frameworks built on it add an extension system and bindings for interface frameworks.

## Options considered

- A wrapper framework on ProseMirror (Tiptap). Not chosen: it adds extension plumbing and framework glue, and nothing for document length. In this project's own prototype (headless Chromium, one machine, the same long text in both builds), the framework's stock editor measured the same per keystroke as bare ProseMirror at every CPU throttle tried; neither limits what a very long editable document costs.
- The core `prosemirror-*` packages, used directly. Chosen.

## Decision

The editor is built on the core `prosemirror-*` packages only. Model, state, view, transform, keymap, commands and changeset are declared now; input rules, the gap cursor and search are added by the first change that needs them. Where each may be imported is fixed in `tools/boundaries.config.ts`.

## Consequences and trade-offs

- Keymaps, commands and the glue between the editor and the interface are ours to write and test. There is no extension catalogue to borrow from.
- In exchange, no layer sits between the editor and the document model, nothing re-renders the interface on each transaction by default, and there is one dependency fewer to pin and follow.
- Speed on long documents comes from the structure of the document (decision 0015), not from a framework.

## Revisit when

The glue we write comes to duplicate a maintained framework so closely that adopting it would remove more code than it adds.
