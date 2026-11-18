# 0009. The first release is a demo that runs on one machine

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

The product is meant to be judged by trying it: offline editing, merging, pagination, history. A hosted service would need a domain, certificates, sign-in through an outside provider, backups and running costs before anyone could try anything, and a stranger would need an account first.

## Options considered

- A hosted app. Not chosen for the first release: every part of hosting has to work before the product can be tried, and none of it shows the product.
- A local demo started by one command. Chosen.

## Decision

The first release is a demo. Clone the repository, run `make demo`, and everything runs on that machine, with seeded people to sign in as. The reason is that anyone can run it and check it with no account and no host. A hosted service is deferred, not dropped, and nothing in the demo may make it harder to add: the demo's server is the program that would run when hosted, so sync, offline work and recovery are the real ones, and only sign-in is replaced.

## Consequences and trade-offs

- Nothing about hosting or use over the internet is verified: TLS, a real sign-in provider, remote backups, deployment, restarts under load.
- The demo has no passwords, which forces the network rules of decision 0010.
- A tester needs Bun installed, and either `make` or `bun run demo`.

## Revisit when

The product is to be used by people who cannot run it themselves, or a feature can only be shown with a server on the internet.
