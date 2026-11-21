# Coding standards

The rules every change follows. [AGENTS.md](../../AGENTS.md) holds the standing rules and is the authority; this page gives them in brief, with the conventions a reviewer asks about. Where the two differ, AGENTS.md is right.

## Shape of the code

- **Layers.** Libraries live in `packages/`, entry points in `apps/`. A package imports only what [the layer rules](../architecture/layers.md) allow, by its name (`@manent/<name>`), never a file inside another package. `bun run boundaries` checks it.
- **Pure packages** use nothing from the DOM, Bun or Node. Time, storage and the network reach them through ports that an app passes in.
- **Confined libraries.** Only `crdt` imports Yjs, only `crdt-binding` imports y-prosemirror, only `apps/desktop` imports Electrobun, and only `storage` and `local-node` open SQLite.
- **Factories, not side effects.** Importing a module does nothing; packages export factories and apps start them.
- **Small files.** A source file holds at most 400 lines. A file that wants a section banner wants to be split.
- **One name per concept.** Identifiers use American spelling (`normalizeDoc`, `color`); prose, comments, test names and interface text use British spelling.
- **Types** are imported in their own `import type { X }` statement.
- **Versions.** External versions live once, in the root catalog (`catalog:`); internal ones are `workspace:*`.
- **Stored shapes and wire formats only gain members.** Nothing is renamed, removed or reordered.

## Comments

A comment says why, or what the signature cannot: a unit, what `null` means, what is thrown. It never restates the code or narrates the change. No commented-out code, and no `TODO` without an owner and a public issue.

## Text a person reads

- Every interface sentence lives in a string table (`packages/ui/src/words/` and `apps/web/src/text.ts`), never as a literal in a component, and a test pins it.
- Sentence case. A sentence ends with a full stop; a label or a button does not. No exclamation marks. Numbers are digits.
- One word per thing, as the glossary in `tools/glossary.ts` lists, and a unit test checks every interface string against it.
- Text shown to a person (the interface, the terminal, the README) never uses the words "generation", "rebuild", "conflict", "error" or "failed".
- Every colour is a token in `packages/ui/src/theme.css`; a unit test refuses a colour anywhere else.

## Tests

Write the test first and watch it fail. Assert exact values. Never weaken, skip or delete a test to pass the gate. See [Testing](testing.md).

## Commits

```text
<type>(<scope>): <summary>
```

- **type** is `feat`, `fix` or `chore`.
- **scope** is the workspace (`schema`, `server-core`), several joined by commas, or none for a change at the root.
- **summary** is in the present tense, starts in lower case, has no full stop, and says what the code now does.

For example: `fix(server-core): a damaged earlier version refuses only its own write`.

## Records

Every merged change adds one entry to [CHANGELOG.md](../../CHANGELOG.md). A decision that constrains later work gets a [decision record](../decisions/README.md) before the code that depends on it merges. A mistake that reveals a class of mistakes adds a [lesson](../memory/lessons.md) with the rule that now prevents it. A change to what works updates the README's status table and the [architecture overview](../architecture/overview.md) in the same change.
