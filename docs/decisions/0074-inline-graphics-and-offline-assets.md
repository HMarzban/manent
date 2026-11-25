# 0074. Inline graphics use the single block node with content-addressed offline binary assets

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Extending the single block node model (decision 0014), one-file-per-project storage (decision 0017), additive schema evolution (decision 0018), pure pagination (decision 0019), browser offline storage (decision 0028), and project archive zips (decision 0043), writers need inline reference images in scripts and broadcast producers need inline chyrons (lower thirds, over-the-shoulder graphics, full-screen graphics) in Show and News scripts. Inline graphics must preserve deterministic pagination across devices, work offline, and keep binary payloads out of CRDT update logs.

## Options considered

- Store base64 image data inside block attributes and measure natural image dimensions in the DOM during pagination. Rejected: bloats CRDT updates and snapshots with binary data, breaks pure pagination (decision 0019), and causes page counts to shift before an image loads.
- Introduce a separate ProseMirror node type for inline graphics. Rejected: breaks the single-block-node invariant (decision 0014) and duplicates selection, history, and CRDT-binding logic.
- Append `"graphic"` to `BLOCK_TYPES` (`SCHEMA_VERSION` 2 to 3) with a flat seven-primitive `attrs.graphic` pinning integer `heightLines` and inline `text*` content for captions and chyron copy, backed by SHA-256 content-addressed binary blobs in IndexedDB and SQLite. Chosen.

## Decision

Inline images and broadcast chyrons (`image`, `lower_third`, `ots`, `full_screen`) use the single `block` node with `type: "graphic"` (`SCHEMA_VERSION` 2 to 3), a flat seven-primitive `attrs.graphic` pinning integer `heightLines` (2 to 24), and inline `content: "text*"` for caption and chyron text. Binary blobs (`image/png`, `image/jpeg`, `image/webp`, at most 5 MiB, at most 4,096 × 4,096 px, at most 200 MiB per project) are SHA-256 content-addressed in IndexedDB's `"assets"` store (`LOCAL_STORE_VERSION` 1 to 2, `durability: "strict"`, with pending uploads pinned against LRU eviction) and in `project_assets` inside `project-<uuid>.sqlite` (`STORAGE_SCHEMA_VERSION` 11 to 12). Pagination stays pure (`boxLines + textLines`, `split: "never"`, zero DOM or image measurement, `ENGINE_VERSION` unchanged), and PDF export embeds PNG and JPEG natively (transcoding WebP to PNG in the browser and drawing a vector placeholder when a blob is not yet on the device).

## Consequences and trade-offs

- Editing caption or chyron text produces zero spurious rewrites of `attrs.graphic` in Yjs, page counts stay identical whether an image is cached locally or still syncing, and SHA-256 addressing deduplicates repeated images within a project.
- Pinning integer line height keeps layout deterministic at the cost of requiring writers to adjust height in lines rather than auto-sizing from image pixels.
- Upload throughput and browser storage pressure at the 200 MiB per-project cap have not yet been measured in the benchmark suite.

## Revisit when

Projects require multi-column storyboard layouts, vector or video attachments, or external blob storage outside per-project SQLite files.
