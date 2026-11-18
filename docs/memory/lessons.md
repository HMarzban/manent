# Lessons

Mistakes and near-misses, newest first, each with the rule that now prevents it. Read the ones that touch your change before you start. Add one when a review finding or an incident shows a class of mistake, not a single slip.

Each lesson has a title, a date and four parts: what happened, how it was caught, the rule, and what enforces the rule. "Enforced by" names the check or test file in backticks, or begins "Nothing yet" and says what will. A lesson is not rewritten after it merges, except to fix a typo or to update "Enforced by" when a check arrives.

## A font-loaded check said yes for a font nobody had declared

- Date: 2026-11-17

### What happened

A guard was meant to stop browser measurements of line wrapping unless the script font had loaded, because a fallback font has other widths and would make every result wrong. It used the browser's font-check call, `document.fonts.check()`. In Chromium, Firefox and WebKit that call answers true for a family with no declaration at all, so a missing stylesheet or a misspelt family name would have passed. A near-miss: the guard never reached `main`.

### How it was caught

By running the guard in all three engines on a page that declared no such font, before any measurement relied on it.

### Rule

To know a font is ready, load each face and inspect what comes back: every face asked for must return a loaded face of that family. A check is run once on an input where it must fail before it is trusted.

### Enforced by

Nothing yet. The browser harness for pagination will carry the guard.

## A cut-off CRDT update can be half applied

- Date: 2026-11-17

### What happened

Applying a truncated update to a bare Yjs document changed the document in 11 of the 79 cut positions tried, instead of refusing the bytes. A client that received a cut-off message could have been left holding part of someone's edit. A near-miss: it never reached `main`.

### How it was caught

By a test written before the code, which cut a real update at every position and applied each prefix.

### Rule

An update is decoded in full before it is applied, and applying it is all or nothing: `applyUpdate` in `@manent/crdt` refuses bytes that do not decode and leaves the document as it was.

### Enforced by

`packages/crdt/test/updates.test.ts` — "any prefix of a real update applies or changes nothing".

## Inserted text took on its neighbour's formatting

- Date: 2026-11-17

### What happened

The CRDT gives inserted text the formatting around it. Text inserted inside a bold or suggested run, by a writer or by a write made on someone's behalf, would silently have joined that run. A near-miss: it never reached `main`.

### How it was caught

A test that pins the library's own behaviour was written before the CRDT writer, and it showed the inheritance.

### Rule

A writer names every attribute in effect at the offset where it inserts, and clears those it does not want, so inserted text carries exactly the marks it was given.

### Enforced by

`packages/crdt/test/writer.test.ts` — "text inserted with no marks inside a suggested run is plain".

## One suggestion written in two forms became two marks

- Date: 2026-11-17

### What happened

Marks that may overlap are stored under a key derived from the mark's attributes. Computed from the attributes as a writer handed them over, a defaulted attribute left out or keys in another order gave a second key for the same suggestion. A merge of two valid documents could then hold two equal marks on one stretch of text, which validation refuses and the loader cannot read. A near-miss: it never reached `main`.

### How it was caught

In code review of the validator, before the CRDT package was written.

### Rule

A key, hash or identity is computed from the canonical form of what it identifies: every declared attribute present, defaults filled in, in the declared order.

### Enforced by

`packages/crdt/test/mapping.test.ts` — "the storage key of a suggestion does not depend on how the mark was written down".

## An attribute stored as an object is rewritten on every keystroke

- Date: 2026-11-17

### What happened

A suggested change to a block was first planned as one attribute holding an object. When the CRDT's ProseMirror binding rewrites a block, it checks each attribute with an identity comparison. An object fails that check every time, so each keystroke in the block would store it afresh under the typist's name and overwrite the author it recorded, which the server has to verify. A near-miss: it never reached `main`.

### How it was caught

By reading the binding's source before the schema was written.

### Rule

Block attributes are scalars; a suggested change is four of them. The cost: each scalar is its own last-writer-wins value, so if two people suggest a change to one block simultaneously, the four values can end up from different people.

### Enforced by

`packages/schema/test/validate.test.ts` — "each kind of damage is named, with its severity" (an object as an attribute's value is refused).

## A test corpus without sentence punctuation never broke a page inside a block

- Date: 2026-11-17

### What happened

The page engine splits speech and action across pages only at the end of a sentence. The generated test corpus had no sentence punctuation, so in 2,414 simulated pages no break fell inside a block, and the path that splits a block across two pages would never have been timed. A near-miss: no measurement had used the corpus yet.

### How it was caught

By simulating pagination over the corpus before the measurements were run.

### Rule

Count the cases a corpus is meant to exercise before trusting it. A count of zero stops the run.

### Enforced by

Nothing yet. The corpus generator's test will count the breaks.

## An import-matching pattern ran across two statements

- Date: 2026-11-17

### What happened

The boundary check finds `import … from` with a regular expression. Its pattern could begin at an earlier statement and run on into the next, so whether an import was for types only was decided from the wrong text. That gave one false report, a correct type import flagged, and one miss, a value import let through. It reached `main` in the check's first version and was fixed in the next commit.

### How it was caught

In code review.

### Rule

A pattern over source text is bounded to one statement, and its test holds both the false report and the miss, written as adjacent statements.

### Enforced by

`tools/test/check-boundaries.test.ts` — "some imports are for types only".

## The fix for a missed match made a false match

- Date: 2026-11-17

### What happened

The boundary check missed `window?.alert` in a pure package, because it expected a dot, a bracket or a parenthesis after a forbidden global. Letting `?` follow as well caught that, and also made the check report an optional parameter or member that merely carries a global's name, such as `document?: Doc`. Known and still open; code in pure packages avoids such names meanwhile.

### How it was caught

In code review of the fix.

### Rule

A pattern fix is tested against what it must newly catch and against what it must still let through.

### Enforced by

`tools/test/check-boundaries.test.ts` — "pure packages touch neither the DOM nor Bun" (the caught case; the false match is not tested yet).

## A typing slip in a budget file made the gate pass

- Date: 2026-11-17

### What happened

The benchmark harness cast its budget file to a type instead of validating it. A misspelt field made the lookup of a budget come back empty, and the verdict for an empty budget was "pass". A row without its hard limit could never fail, and a row that matched no scenario was ignored. A near-miss: it was fixed before the harness reached `main`.

### How it was caught

In code review.

### Rule

Data that drives a gate is validated, its version and fields included, and an entry that matches nothing is a finding, never a pass.

### Enforced by

`bench/test/harness.test.ts` — "a malformed budget file stops the run and names the file and the row".

## Two documents' chunks could be spliced on one socket

- Date: 2026-11-17

### What happened

Large messages travel in chunks tagged with a message ID. Each frame encoder numbered its chunked messages itself, so two encoders sending large messages on one connection could use the same ID, and the receiver would join chunks of two documents into one message. It reached `main` with the first wire format, before any client used it.

### How it was caught

Reproduced in an audit of the wire format before any client existed. The frozen format was reopened once to fix it.

### Rule

Message IDs belong to the connection. Every encoder of a connection draws from one allocator, and a test runs two producers into one consumer.

### Enforced by

`packages/sync-protocol/test/chunking.test.ts` — "two encoders on one connection never share a message ID".

## Containment CSS sent the caret to the end of the document

- Date: 2026-11-17

### What happened

With `content-visibility: auto` on sections of blocks, three engines misbehaved in three ways. In Chromium, an arrow key pressed while the caret's neighbouring sections were not rendered moved the caret hundreds of thousands of characters, to the last section of the document. WebKit moved a selection that code had set inside a section never rendered. In Firefox, explicit `contain` on a section stopped the arrow keys crossing a section boundary. A near-miss: no product code uses sections yet.

### How it was caught

In a throwaway prototype run in the three engines (their test builds, on one operating system), comparing every check with a flat document.

### Rule

The four safeguards of decision 0015, and no explicit `contain` on a section.

### Enforced by

Nothing yet. The editor's browser tests will hold these cases.

## Typing lag came from the interface and whole-document walks, not the editor core

- Date: 2026-11-17

### What happened

Typing lag is easily blamed on the editor core. In this project's prototype, ProseMirror's own share of a keystroke was small: about 1.3 ms of 18 ms in a flat 1,000-page document, the rest being the browser's own editing, style and layout. Experience with other editors points the same way: lag comes from interface components rendering again on each transaction and from plugins that walk the whole document. A near-miss: nothing had yet been optimised in the wrong place.

### How it was caught

By measuring where a keystroke's time goes before optimising anything.

### Rule

Decision 0031: the interface does not render on editor transactions, and a plugin that walks the whole document on a transaction is a defect.

### Enforced by

Nothing yet. The benchmark's typing budget will.

## Containment on every block was slower than none

- Date: 2026-11-17

### What happened

`content-visibility: auto` on each of 25,000 blocks cost more per keystroke than no containment: about 30 ms against 18 ms in a flat 1,000-page document, and scrolling fell to frames of about 49 ms. On wrappers of about 25 blocks it cut the keystroke from about 18 ms to 1.4 ms, about twelve-fold, and a later sweep found about 100 blocks per wrapper faster still at 2,000 pages. Prototype, headless Chromium, one machine. A near-miss: no product code did this.

### How it was caught

By measuring each variant in a throwaway prototype before choosing one.

### Rule

Contain groups of about 100 blocks, never single blocks.

### Enforced by

Nothing yet.

## A decoration at the document root is paid for on every keystroke

- Date: 2026-11-17

### What happened

ProseMirror maps the decorations of a set on every transaction. A stand-in for pagination that put a break widget for every page in the root set cost ProseMirror about 1.8 ms per keystroke at 120 pages and 58 ms at 1,000, with the CPU throttled four times. One node decoration per section, setting its height, cost about 8 ms per keystroke at 2,000 sections. Prototypes, one machine. A near-miss: no product code did this.

### How it was caught

In throwaway prototypes that measured each placement before pagination was designed.

### Rule

Decorations live inside sections, in per-section sets, never in one set at the root. A section's height is set by its node view.

### Enforced by

Nothing yet.

## A pattern literal can blind a text scanner

- Date: 2026-11-17

### What happened

The boundary check masks comments and strings before it looks for imports, and it does not understand regular-expression literals. A literal holding a quote, a backtick or the two characters that open a block comment can make it read the rest of the file as a string or a comment and blank it, so the imports below are never checked. A limit of how the check reads source, found before it hid a violation.

### How it was caught

In code review of the check.

### Rule

Build such a pattern with `new RegExp("…")`, never as a literal.

### Enforced by

Nothing yet. The limit is stated at the top of `tools/source-scan.ts`.

## A script named after a built-in command replaces it

- Date: 2026-11-17

### What happened

Bun runs a package script in place of its own command when the two share a name. Scripts called `check` or `fmt` would have made `bun check` and `bun fmt` run those scripts instead of Bun's own type checker and formatter. A near-miss: the scripts never had those names.

### How it was caught

Noticed while the scripts were named.

### Rule

A script never takes the name of a command of the tool that runs it. The gate is `verify`, and its steps are `typecheck` and `format`.

### Enforced by

Nothing yet.

## A duration written as a string was refused

- Date: 2026-11-17

### What happened

The minimum release age written as `"3d"` was refused by an earlier release of the package manager. Had it been written that way here, an install with that release would have stopped. A near-miss: the setting was written as a number from the start.

### How it was caught

Known from earlier use of the package manager, before this repository's settings were written.

### Rule

Durations in configuration are integer seconds: `minimumReleaseAge = 259200` in `bunfig.toml`.

### Enforced by

`tools/test/workspace.test.ts` — "minimumReleaseAge is three days in integer seconds".

## A version chosen on paper was too new to install

- Date: 2026-11-17

### What happened

Three versions named while the work was planned were less than three days old when it started, and the installer refused them under the project's own release-age rule. An older patch release of each was used instead. A near-miss: the refusal came before anything depended on the newer versions.

### How it was caught

By trying the install under the rule before the work started.

### Rule

A version is pinned only after an install under the rule succeeds, and the version that install chose is the one written down.

### Enforced by

Nothing yet.

## A check that names what is private is itself the leak

- Date: 2026-11-17

### What happened

The first idea for keeping private folders out of the repository was a check that listed them by name. That list, in a tracked file, would have published the very names it was meant to hide; the same holds for an ignore file or a lint configuration that names them. A near-miss: no such list was written.

### How it was caught

While the check was being designed.

### Rule

An allow-list for paths (decision 0002). Private words are read from the maintainer's machine, never from a tracked file.

### Enforced by

`tools/test/check-tracked.test.ts` — "only the public tree may be tracked".

## A timing taken on a busy machine is not a measurement

- Date: 2026-11-17

### What happened

While other work ran, the machine's load stood at the limit agreed for timed runs, and a timing harness adds load of its own: a browser under CPU throttling, or a container on two cores, can push the load over the limit by itself. A row timed under such load looks like a real result. A near-miss: no timed run had been made yet.

### How it was caught

By reading the machine's load before the first timed run, and in review of how the runs would be timed.

### Rule

A timed run records the machine's load, a run above the limit is void, and a check that could not run is reported as not run, never as passed.

### Enforced by

Nothing yet. The benchmark harness does not record load yet.

## A check that read Markdown as plain text misread tables and code samples

- Date: 2026-11-17

### What happened

While the check of the public records was being written, a table header that it matched as plain text stopped matching once the formatter padded the table's cells, and a link shown inside a code span, as an example, was reported as a link to a missing file. A near-miss: both were found before the check was committed.

### How it was caught

By running the check on documents that had been through the formatter, before committing it.

### Rule

Compare table cells, not lines, and ignore structure inside code spans and fenced blocks.

### Enforced by

`tools/test/check-records.test.ts` — "link syntax inside code is not a link".
