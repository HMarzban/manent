# 0033. A browser tab is one person

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

The demo has to show collaboration on one machine: two people writing the same script side by side. If identity were kept per browser, a tester would need two browsers, or private windows, to be two people.

## Options considered

- One identity per browser, in storage every tab shares. Rejected: two tabs could not be two people.
- One identity per tab, in tab storage. Chosen.

## Decision

Who a tab is lives in tab storage under the key `manent.demo.session` (`apps/web/src/session.ts`), so two tabs of one site can be two people. Everything shared across tabs later, such as the lock that chooses one leader tab, the channel between tabs and the local store, needs the person in its key as well as the site.

## Consequences and trade-offs

- Trying collaboration takes only a second tab.
- Every resource that tabs share needs the person in its key, which is easy to forget.
- A reload keeps the tab's person, while a newly opened tab starts by asking who you are.
- `apps/web/test/session.test.ts` fixes the key and the shape of the stored value.

## Revisit when

Hosting brings real sign-in, where one person per browser may be what people expect.
