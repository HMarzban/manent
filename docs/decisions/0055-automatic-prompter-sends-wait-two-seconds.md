# 0055. Automatic prompter sends wait two seconds and save no version

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Outside a rundown's air window, story edits flow to the prompter automatically so rehearsals and preparation stay current without manual Send clicks. Inside the air window, nothing reaches the prompter until someone with `send_to_prompter` presses Send. A busy daily show or newscast already accumulates thousands of versions a day; saving a History version for every automatic prompter update would multiply version volume and crowd the History list.

## Options considered

- Save a `prompter` History version on every send, automatic and manual alike. Rejected: active writing outside the air window would double version churn and bury intentional on-air sends in History.
- Push automatic updates to the prompter on every committed edit with no quiet delay. Rejected: streams half-typed words to rehearsal prompters and increases server broadcast traffic.
- Wait until a story has been quiet for 2 seconds before sending automatically outside the air window, record no History version for automatic sends, and save a `prompter` History version only when a person presses Send. Chosen.

## Decision

Outside a rundown's air window, `createAutoSender` waits until a linked story has been quiet for 2 s (`AUTO_SEND_QUIET_MS`) before sending it automatically to the prompter and saves no History version (`versionId: null`, `senderUserId: null`). Only a person's explicit Send (`POST /api/prompter/send`) keeps a `prompter` version in History; `Send previous` restores an earlier send onto the prompter without creating a version or altering the script.

## Consequences and trade-offs

- Rehearsal prompters follow story edits within two seconds of each pause in typing without inflating History or version storage, while every deliberate on-air Send is permanently recorded and reversible with `Send previous`.
- When an air window closes, any rows that changed while inside the window flush automatically.
- Automatic sends do not appear as named versions in History (they reference their recorded log position while retained), and continuous typing outside the air window delays automatic prompter updates until a 2 s pause.
- Daily version volume under show and newsroom workloads has not yet been measured in the benchmark suite.

## Revisit when

Broadcast teams require an immutable History entry for every automatic rehearsal send or a configurable quiet delay per project.
