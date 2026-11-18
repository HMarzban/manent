# 0010. The demo has no passwords, so the server refuses to be reachable

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

In the demo a person signs in with one click as one of the seeded people (decision 0009). A server that accepted that from anywhere would let anyone who can reach it read and write every demo document. A page on another site can also try to reach a server on the visitor's own machine, by pointing a host name it controls at a local address.

## Options considered

- Passwords for the demo people. Rejected: a step added to every try, protecting nothing a tester cares about.
- Listen on every interface and trust the local network. Rejected: a laptop on a shared network would expose the demo.
- Refuse to be reachable from outside. Chosen.

## Decision

The server listens on loopback only, and also on one private-range address when started with `make demo LAN=1`, which lets a second computer on that network join. It refuses a wildcard or public address, answers only requests addressed to its own host, and refuses a socket whose origin is missing or foreign. The address rules are in `packages/server-core/src/net/bind.ts`, with their tests in `packages/server-core/test/bind.test.ts`.

## Consequences and trade-offs

- A demo session is a signed token that the tab keeps in its own storage and sends as a bearer header. The page's scripts can read it, it never expires, and it cannot be revoked.
- The production path, a cookie scripts cannot read, protection against cross-site requests, and sessions that expire, is exercised by no demo test.
- Across the local network the demo is plain HTTP, so browser features that need a secure context are unavailable on the second machine.

## Revisit when

Hosting arrives. It brings a real sign-in provider, and the production session path becomes the one the tests exercise.
