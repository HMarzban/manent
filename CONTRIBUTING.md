# Contributing to Manent

Thank you for wanting to help. This page says how to propose a change and what happens to it. The rules every change follows are in [AGENTS.md](AGENTS.md); [Coding standards](docs/development/standards.md) adds the conventions it does not cover.

## Before you start

- **A bug.** Search the issues first. If it is new, open one with the bug template: what you did, what you expected, what happened, and your system and browser.
- **A feature or a larger change.** Open an issue and describe the problem before you write code. Manent's scope and its decisions are recorded in [docs/decisions](docs/decisions/README.md); a change that goes against one needs a new decision record, so it is worth agreeing on first.
- **A security problem.** Do not open an issue. Follow [SECURITY.md](SECURITY.md).

## Set up

You need Bun 1.4.4 (the version CI uses; the demo accepts later ones) and Git. [Set up a development copy](docs/development/setup.md) has the details.

```sh
git clone https://github.com/HMarzban/manent.git
cd manent
bun install
bun run verify
```

## Make the change

1. Create a branch from `main`.
2. Write the test first and watch it fail for the reason you expect. Then make it pass.
3. Keep the change to what it needs: no unused export, option or file, and nothing said twice.
4. Run `bun run verify` until it passes cleanly. `bun run format` fixes formatting.
5. If the change touches the browser, run the end-to-end tests that cover it ([Testing](docs/development/testing.md)).
6. Add one entry to [CHANGELOG.md](CHANGELOG.md) under Unreleased, for a reader who did not see the work.
7. If the change alters what works, update the README's status table and [the architecture overview](docs/architecture/overview.md) in the same change.
8. Commit as `<type>(<scope>): <summary>`, where the type is `feat`, `fix` or `chore` and the scope is the workspace. See [Commits](docs/development/standards.md#commits).

Then open a pull request. The template asks what changed, why, and how you checked it.

## How a change is reviewed

- **CI.** The workflow runs `bun run verify`, the end-to-end tests in Chromium, Firefox and WebKit, and the fresh-clone test, on Ubuntu, macOS and Windows. It does not pass on `main` yet; until it does, the reviewer runs `bun run verify` and the end-to-end tests that cover the change locally, and says so in the review.
- **Does it do what it says?** The reviewer reads the change against the issue or the description: every stated behaviour is there and tested, and nothing else is.
- **Is it clean?** The reviewer checks [AGENTS.md](AGENTS.md) and the [coding standards](docs/development/standards.md): the layer rules, names, comments, the interface's words, tests that assert exact values, no defensive code for what the types already rule out, nothing duplicated.
- **Are the records kept?** A changelog entry; a decision record where a decision was made; a lesson where a mistake revealed a class of mistakes.
- **Findings** come back as comments. Fix them in new commits on the same branch; the reviewer looks again at what changed.

A maintainer merges once those checks pass and the review has no open findings.

## Licence of contributions

By contributing, you agree that your contribution is licensed under the same terms as the project, as set out in [LICENSE](LICENSE).

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
