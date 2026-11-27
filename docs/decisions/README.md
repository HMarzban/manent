# Decisions

One short record per decision that constrains later work. A record says what was decided, what else was considered, what it costs and what would make us look again.

## Rules

- A record is written before the code that depends on it merges.
- Numbers are four digits, in the order the records were written, with no gaps. If `main` took your number first, take the next one.
- A record is not rewritten after it merges, except to fix a typo or to change its status. A decision that turns out wrong gets a new record, and the old one's status becomes `Superseded by NNNN`.
- `Decided by` names a role, never a person: `project owner`, `engineering lead`, or `project owner and engineering lead`.
- Evidence is stated with its conditions (machine, data, number of runs) and with what was not measured.
- Every record is listed in the index below, in order, as `- [NNNN. Title](file)`; a superseded one ends ` — superseded by NNNN`.
- Records 0002 to 0033 were written on 2026-11-17 from working notes, after the decisions had been made. Their date is the day they were recorded.

## Template

File name: `NNNN-short-title.md`, lower case, words joined by hyphens.

```text
# NNNN. Title in sentence case

- Date: YYYY-MM-DD
- Status: Accepted
- Decided by: project owner

## Context

What forced a decision, and the constraints that applied.

## Options considered

Each option, with the reason it was or was not chosen.

## Decision

What was decided, in one or two sentences.

## Consequences and trade-offs

What this buys, what it costs, and where the limit is.

## Revisit when

The evidence or event that would reopen this.
```

## Index

- [0001. Keep public project records, checked by the gate](0001-public-project-records.md)
- [0002. Working notes stay out of the repository, and the public tree is an allow-list](0002-working-notes-stay-out.md)
- [0003. A measured claim carries its conditions](0003-measured-claims-carry-conditions.md)
- [0004. Bun is the only toolchain](0004-bun-is-the-only-toolchain.md)
- [0005. One workspace, one lockfile, one version catalog](0005-one-workspace-one-catalog.md)
- [0006. Package boundaries are an allow-list, checked from source text](0006-boundaries-are-an-allow-list.md)
- [0007. One gate: `bun run verify`](0007-one-local-gate.md) — superseded by 0077
- [0008. Packages export factories, and importing a module does nothing](0008-factories-and-quiet-imports.md)
- [0009. The first release is a demo that runs on one machine](0009-first-release-is-a-local-demo.md)
- [0010. The demo has no passwords, so the server refuses to be reachable](0010-password-less-demo-stays-local.md)
- [0011. One document must stay comfortable at 2,000 pages](0011-two-thousand-pages.md)
- [0012. The benchmark ships with the app, and its budgets are checked data](0012-benchmark-ships-with-the-app.md)
- [0013. Plain ProseMirror, without a wrapper framework](0013-plain-prosemirror.md)
- [0014. One block node whose element is an attribute](0014-one-block-node.md)
- [0015. Invisible sections keep long documents fast](0015-invisible-sections.md)
- [0016. Every block carries its own stable ID](0016-stable-block-identity.md)
- [0017. One document per script, episode, segment or story, stored one file per project](0017-one-document-per-script.md)
- [0018. Schema and wire changes only add, and content from a newer build is kept](0018-additions-only.md)
- [0019. Pagination is a pure function of the document, drawn with decorations](0019-pagination-is-a-pure-function.md)
- [0020. What can be derived is not stored](0020-derived-not-stored.md)
- [0021. Locked pages are ordered page-start anchors](0021-locked-pages-are-anchors.md)
- [0022. A CRDT with a custom sync server, not a central-authority protocol](0022-crdt-with-a-custom-server.md)
- [0023. Yjs 13 behind a narrow interface that one package owns](0023-yjs-behind-a-narrow-interface.md)
- [0024. The server is the only authority for a synced document](0024-one-authority.md)
- [0025. History lives outside the live document](0025-history-outside-the-live-document.md)
- [0026. A document is rebuilt only when it is over budget](0026-rebuild-only-over-budget.md)
- [0027. One compiled server program on SQLite files](0027-one-server-program.md)
- [0028. On the web, offline work lives in browser storage](0028-browser-storage-on-the-web.md)
- [0029. Desktop shell: Electrobun with bundled Chromium, Electron as the fallback](0029-desktop-shell.md)
- [0030. Interface stack: React, TanStack libraries, Zustand, shadcn components on Base UI](0030-interface-stack.md)
- [0031. The interface does not render on editor transactions](0031-interface-off-the-keystroke-path.md)
- [0032. Tool and interface text never says "error" or "failed"](0032-one-vocabulary.md)
- [0033. A browser tab is one person](0033-a-tab-is-one-person.md)
- [0034. Final Draft 7 files are read only for interoperability, and until their structure is known Manent asks for an .fdx](0034-reading-final-draft-7-files.md)
- [0035. Each project has its own index document](0035-project-index-document.md)
- [0036. Group and workspace access expands into per-member role rows with a source](0036-group-access-expanded-into-doc-roles.md)
- [0037. A script's comments live in a document of their own](0037-comments-in-their-own-document.md)
- [0038. A copy is a new document with fresh block IDs and a source record](0038-copies-have-new-block-ids-and-record-their-source.md)
- [0039. Private writing merges at hand-in through the three-way block merger](0039-private-writing-merges-at-hand-in.md)
- [0040. The room's driver is held in server memory and announced over the socket](0040-room-driver-in-server-memory.md)
- [0041. Headers and footers draw in the page margins with no pagination engine change](0041-headers-and-footers-in-page-margins.md)
- [0042. PDF text and Word files are read in the browser with declared libraries](0042-pdf-and-docx-import-in-the-browser.md)
- [0043. A project archive is a zip built on the device](0043-project-archive-zip-format.md)
- [0044. Scene assignment and suggestion-only editing are interface conventions, not server locks](0044-assignment-and-suggestions-are-interface-only.md)
- [0045. An outline uses General prose and scene headings with synopses as beats](0045-outline-elements.md)
- [0046. A flagged Check is a comment thread](0046-flagged-check-is-a-comment-thread.md)
- [0047. Every text-attached feature shares one text-anchor shape](0047-one-text-anchor-shape.md)
- [0048. One sortable component serves every reordered list and grid](0048-one-sortable-component-for-every-reorder.md)
- [0049. Timing lives in pagination](0049-timing-in-pagination.md)
- [0050. One prompter projection serves every output](0050-one-prompter-projection.md)
- [0051. Server durations are coalesced per story and written by the authority](0051-coalesced-server-durations.md)
- [0052. A rundown cell carries its previous value with its writer and time](0052-rundown-cell-previous-value.md)
- [0053. The rundown opens in the one document frame by kind](0053-rundown-in-one-document-frame.md)
- [0054. Editing a rundown requires edit access and the edit-rundowns capability](0054-edit-rundowns-capability.md)
- [0055. Automatic prompter sends wait two seconds and save no version](0055-automatic-prompter-sends-wait-two-seconds.md)
- [0056. The air window opens 60 minutes before air and closes after the show](0056-air-window-bounds.md)
- [0057. Prompter file output uses plain text with a tab-separated row list](0057-plain-text-prompter-files.md)
- [0058. Prompter feeds heartbeat every second and report feed loss after three seconds](0058-prompter-heartbeat-and-feed-loss-threshold.md)
- [0059. Tiered storage durability and on-demand delivery](0059-tiered-storage-durability-and-on-demand-delivery.md)
- [0060. Full-text search uses a derived SQLite index behind a port](0060-derived-search-index.md)
- [0061. Ink compiles and plays in one Web Worker with the compiler retained](0061-ink-compile-and-player-host.md)
- [0062. Deleted documents stay in Trash for thirty days on the server clock](0062-recoverable-trash.md)
- [0063. Workspace folders live in the workspace index and hold projects](0063-folders-in-workspace-index.md)
- [0064. Per-project "Can also" capabilities live in the project index](0064-can-also-project-permissions.md)
- [0065. The public API authenticates workspace API keys only, read-only and scoped](0065-public-api-auth-and-scope.md)
- [0066. Workspace notifications deliver from a persistent outbox off the write path](0066-outbox-notifications.md)
- [0067. Scripts pin their layout engine explicitly in script settings](0067-explicit-layout-engine-pinning.md)
- [0068. Sides export whole locked pages with other scenes struck through](0068-sides-export-format.md)
- [0069. Animation pickup lines export dialogue changed since the newest Record draft as CSV](0069-animation-pickup-lines.md)
- [0070. Character, scene and location reports export in both CSV and PDF](0070-script-reports-csv-and-pdf.md)
- [0071. Whole Ink projects export as one concatenated file in Library order](0071-whole-ink-project-export.md)
- [0072. Remote prompter scroll control uses a server-held operator lease and client-side interpolation](0072-remote-prompter-scroll-control.md)
- [0073. External MOS prompters connect through a PrompterFeedHub-only TCP bridge](0073-mos-tcp-prompter-bridge.md)
- [0074. Inline graphics use the single block node with content-addressed offline binary assets](0074-inline-graphics-and-offline-assets.md)
- [0075. Reusable Show and News templates live in the workspace and project indexes](0075-reusable-show-templates.md)
- [0076. Rundown viewers receive server-projected views and rundowns carry full version history](0076-rundown-viewer-and-full-history.md)
- [0077. Parallel gate and CI job fan-out](0077-parallel-gate-and-ci-fan-out.md)
- [0078. Brand identity, 24 studio themes and eye-health standard](0078-brand-identity-and-studio-themes.md)
- [0079. Dedicated read-only Version history page with floating Change-Aware Minimap TOC](0079-dedicated-read-only-version-history-page.md)
- [0080. Installable PWA delivery, safe service-worker updates and landing-site freshness](0080-pwa-installability-update-lifecycle-and-site-freshness.md)
- [0081. Archival Stone & Ochre demo stage and three-tier blast-radius controls](0081-archival-demo-stage-and-blast-radius-controls.md)
- [0082. Smart contextual Command Palette](0082-smart-contextual-command-palette.md)
- [0083. Smart Command Palette direct jumps, inline numeric prompts and contextual Quick Jumps](0083-smart-palette-direct-jumps-and-inline-numeric-settings.md)
- [0084. Unified Tour story tracks and Smart Director's Rail demo stage](0084-unified-tour-story-and-smart-demo-stage.md)
- [0085. Game Script playthrough runs as a pure block walker unified with Ink's Play flow](0085-game-script-playthrough-and-unified-player.md)
- [0086. Book formatting toolbar and manuscript authoring chrome](0086-book-formatting-toolbar-and-manuscript-authoring.md)
