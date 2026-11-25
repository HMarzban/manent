# 0042. PDF text and Word files are read in the browser with declared libraries

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Writers often arrive with scripts saved only as text-based PDFs or Microsoft Word (`.docx`) files, and they expect Import… to work offline on their device without uploading private manuscripts to a server. Reading those formats also carries security and bundle-size risks if parsers are unguarded or loaded eagerly on first paint.

## Options considered

- Parse PDF and `.docx` files on the server over an upload endpoint. Rejected: import would stop working offline and on local-only scripts, and the server would have to execute complex third-party document parsers over untrusted uploads.
- Write custom PDF and zip/deflate parsers from scratch. Rejected: PDF text extraction (encoding maps, font metrics, compressed object streams) is large and brittle to reimplement, whereas a focused XML reader over a small audited zip library keeps `.docx` parsing tiny and bounded.
- Read text-based PDFs with `pdfjs-dist` (loaded lazily) and `.docx` files with `fflate` plus Manent's own XML reader, both inside `@manent/formats` in the browser and offline. Chosen.

## Decision

`@manent/formats` reads text-based PDFs using `pdfjs-dist` (dynamically imported on first PDF import, with network fetches, font faces and XFA disabled and page and item limits enforced) and reads Word `.docx` files using `fflate` to extract only `word/document.xml` and `word/styles.xml` under explicit file-size, part-size and entry-count bounds. Both libraries are declared in the root catalog and run completely in the browser and offline.

## Consequences and trade-offs

- Importing PDF and Word files works offline, keeps drafts on the writer's device, and never adds server attack surface.
- Lazy loading `pdfjs-dist` keeps the web app's initial bundle unaffected while still supporting text-based screenplay PDFs, and scanned image-only PDFs are detected and refused cleanly.
- Bounded selective extraction in the `.docx` reader prevents zip bombs and skips embedded media parts; rich Word features outside screenplay paragraphs and styles (such as images, tables or comments) are reported in the import summary rather than silently dropped.

## Revisit when

Optical character recognition for scanned PDFs becomes a requirement, or a smaller browser PDF text extractor replaces `pdfjs-dist` without losing text-coordinate accuracy.
