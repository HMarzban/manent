# Coding standards

The rules every change follows are in [AGENTS.md](../../AGENTS.md): [the gate](../../AGENTS.md#the-gate), [boundaries](../../AGENTS.md#boundaries) between packages and layers, [code](../../AGENTS.md#code) and [records](../../AGENTS.md#records). Read it first; this page does not repeat it. It adds the conventions a reviewer also asks about, each said here only.

## Files

- A source file holds at most 400 lines; a unit test in the gate refuses a longer one. A file that wants a section banner wants to be split.
- Only `storage` and `local-node` open SQLite (`bun:sqlite`); the boundary check refuses it anywhere else.

## Comments

A comment says why, or what the signature cannot: a unit, what `null` means, what is thrown. It never restates the code or narrates the change. No commented-out code, and no `TODO` without an owner and a public issue.

## Text a person reads

- Every interface sentence lives in a string table (`packages/ui/src/words/` and `apps/web/src/text.ts`), never as a literal in a component, and a test pins it.
- Sentence case. A sentence ends with a full stop; a label or a button does not. No exclamation marks. Numbers are digits.
- One word per thing, as the glossary under `tools/glossary/` (`tools/glossary/index.ts`, paired with `tools/plain-words.ts`) lists, and a unit test (`tools/test/glossary.test.ts`) checks every interface string against it.
- Every colour is a token in `packages/ui/src/theme.css`; a unit test refuses a colour anywhere else.
- Interface surfaces, skeletons, empty states, motion, avatars, dialogs and Present follow [Design system](design-system.md).

## Commits

AGENTS.md gives the form, `<type>(<scope>): <summary>`. The scope is one workspace (`schema`, `server-core`), several joined by commas, or none for a change at the root. The summary starts in lower case, has no full stop, and says what the code now does. For example: `fix(server-core): a damaged earlier version refuses only its own write`.
