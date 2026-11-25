# 0056. The air window opens 60 minutes before air and closes after the show

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Inside a rundown's air window, automatic prompter sends pause so only deliberate Send actions change what appears on the prompter, and automatic document reorganisations are postponed for linked stories. The air window needs clear start and end bounds that protect pre-show lock-in and remain active if a broadcast runs longer than its target length.

## Options considered

- Require producers to switch an air lock on and off by hand. Rejected: forgetting to enable it before air exposes live edits on the prompter, and forgetting to clear it leaves automatic updates stuck off afterwards.
- End the air window strictly at `airAt + targetMs`. Rejected: any broadcast running over target would leave the air window while still live, resuming automatic prompter sends and document reorganisations on air.
- Open the air window 60 minutes before `airAt` (configurable in Details → Rundown from 0 to 240 minutes) and close it at `airAt + max(targetMs, totalMs)`. Chosen.

## Decision

A rundown's air window starts at `airAt - windowLeadMs` (60 minutes by default, editable between 0 and 240 minutes in Details → Rundown) and ends at `airAt + Math.max(targetMs ?? 0, totalMs)`. `timeRundown` computes the bounds and `createAirWindows` projects them onto both the rundown and every story linked from it.

## Consequences and trade-offs

- Broadcasts that run over target stay inside the air window until the longer of the target length and the sum of row durations elapses, and producers can adjust the pre-air lead time per rundown in Details.
- A story linked by more than one rundown prefers an active air window first, then the soonest upcoming window.
- A rundown with no `airAt` has no air window and stays in automatic-send mode, and an unplanned overrun beyond the timed total requires extending a row's duration or the target length to keep the window active.

## Revisit when

Live newsrooms or breaking-news shows need manual "Extend air window" or "Off air" overrides independent of scheduled durations.
