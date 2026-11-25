# 0043. A project archive is a zip built on the device

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

A project owner exporting a whole film, show or series needs a portable backup that works both in other screenwriting tools and as a faithful record of named drafts, even when offline or working with local scripts. The archive format must be self-describing, cross-platform safe, and never silently include empty files when a script could not be read.

## Options considered

- Generate the archive on the server and stream a download. Rejected: local-only or offline edits on the device would be missing, and offline export would be impossible.
- Export one proprietary JSON bundle for the whole project. Rejected: a writer opening the archive years later without Manent could not open their scripts directly in Final Draft, Fountain tools or a plain text editor.
- Build one zip file on the device containing one folder per document (holding Final Draft, Fountain and each named draft's exact JSON) plus a top-level `manifest.json`. Chosen.

## Decision

A Project archive is a zip built on the device by `writeArchive` in `@manent/formats` (using `fflate`). Each document gets a folder named from its title (sanitised for file-system characters and deduplicated case-insensitively) holding `{title}.fdx`, `{title}.fountain`, and `drafts/{draft name}.json` for every named draft whose content is available, together with a top-level `manifest.json` listing the project title, export timestamp, folders and drafts. Any script that cannot be read whole stops the export with a clear message instead of writing an empty file.

## Consequences and trade-offs

- Anyone opening the zip can read every script immediately in Final Draft, any Fountain tool or a text editor while also keeping exact named-draft snapshots for faithful re-import or archival.
- Exporting on the device works with unsynced local work and uses the same `fflate` dependency already declared for `.docx` reading.
- Because building the zip holds the archive bytes in browser memory, very large projects with hundreds of named drafts may eventually need streaming zip assembly, and drafts whose content is not reachable while offline are omitted and left out of the manifest rather than fabricated.

## Revisit when

Projects routinely exceed browser memory budgets during zip assembly, or Manent adds round-trip Project archive import that needs extra metadata beyond `manifest.json` and the draft snapshots.
