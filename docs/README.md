# Manent documentation

Start with the section that matches what you want to do. Every page states what works in this build and notes its current limits.

## Use Manent

- [Getting started](guide/getting-started.md): run the demo, choose a person or start in a clean workspace, launch the desktop app, and what to try first.
- [Writing a script](guide/writing.md): all eight formats, Tab and Enter flow, element picker, Book studio (floating format bar, cover & front/back matter, footnotes and Engine 3 book layout), inline graphics and chyrons, Show/News templates and writing tools.
- [Saving and syncing](guide/saving-and-syncing.md): what "Saved", "Synced" and "waiting" mean, offline work, merging after time apart, and Version history.
- [Working together](guide/working-together.md): live cursors, Following, sharing, comments and rounds, suggestions, private copies, the Room window, production revisions, rundowns, Rundown History, live prompter and external MOS.
- [Export, print and import](guide/export-and-print.md): PDF, facing spreads, EPUB 3, Word (`.docx`), Markdown (`.md`), Multi-part Book Compile, Sides, FDX, Fountain, Game Script, Ink, rundown exports, Project archives and importing files.
- [Keyboard shortcuts](guide/keyboard-shortcuts.md): default keys and the smart command palette (`Ctrl+K` / `⌘K`).
- [Preferences and accessibility](guide/preferences-and-accessibility.md): personal and device settings, 24 studio themes, Clean workspace restore, desktop Connection/About controls, and keyboard and screen-reader support.
- [Public API and notifications](guide/api.md): workspace API keys, read-only `/api/v1/` HTTP endpoints, rate limits, webhooks, Slack and Resend email delivery.

## Work on Manent

- [Set up a development copy](development/setup.md): requirements, everyday commands, server environment variables and `bun run verify`.
- [Testing](development/testing.md): unit, property and DOM tests, three-browser end-to-end suites, fresh-clone checks, long runs and manual screen-reader checklist.
- [Benchmarks](development/benchmarks.md): running the suite, scenarios, budgets and publishing; see the published [Benchmark report](benchmark/report.md).
- [Desktop app](development/desktop.md): building and running the Electrobun shell, custom studio chrome, local-node offline behaviour, updates and installers.
- [Coding standards](development/standards.md): review conventions that complement [AGENTS.md](../AGENTS.md).
- [Design system](development/design-system.md): Bound "M" brand kit, 24 studio themes, eye-health standard, tokens, surfaces, motion, dialogs, Present, History, Book studio, Command Palette and desktop chrome.
- [Contributing](../CONTRIBUTING.md): proposing changes, commit format and review process.

## Understand Manent

- [Architecture overview](architecture/overview.md): system diagram, deployment modes, every workspace and its status, document model and keystroke-to-disk data flow.
- [Working together](architecture/working-together.md): comments and anchors, sharing and group expansion, sent drafts, suggestions, private copies and the Room window.
- [Projects and series](architecture/projects-and-series.md): project index maps, shared styles, page furniture, series episodes, room documents and the Series Board.
- [Rundowns and timing](architecture/rundowns.md): Variety and Podcast timing, collaborative Show and News rundowns, server durations and air windows.
- [Prompter](architecture/prompter.md): one prompter projection, manual and 2-second automatic sends, Send previous, live feed fan-out, MOS and desktop prompter files.
- [Workspace, search and Ink](architecture/workspace-search-and-ink.md): full-text FTS5 search, Trash and folders, Workspace settings, `Can also` permissions, public REST API, notifications, Ink/Game Script playback, versioned layout engines and Sides.
- [Layers and dependency rules](architecture/layers.md): enforced import rules for every workspace and how `bun run boundaries` checks them.
- [Repository outline](architecture/repository.md): every top-level folder, package, app route and tooling script.
- [Decision records](decisions/README.md): architectural decisions, alternatives considered, trade-offs and revisit triggers.
- [Lessons](memory/lessons.md): mistakes and near-misses, newest first, and the rule enforcing each.
- [Changelog](../CHANGELOG.md): what changed on `main`, newest first.
