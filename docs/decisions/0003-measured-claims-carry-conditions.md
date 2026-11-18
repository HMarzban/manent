# 0003. A measured claim carries its conditions

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

The project makes claims about speed, size and correctness, and much of the early evidence comes from throwaway prototypes on one machine. A number quoted without its conditions reads as a guarantee. The project owner made honesty about what was verified a requirement: a claim that was never measured or tested counts as a failure even when the feature works.

## Options considered

- Quote the best figure from a run. Rejected: it flatters the product and cannot be reproduced.
- Publish no numbers until the benchmark suite exists. Rejected: early decisions need the first-order evidence that prototypes give.
- State every number with its conditions and its limits. Chosen.

## Decision

Nothing is called verified unless it was run. A number states the machine, the data, the number of runs and what was not covered. A figure from a prototype is called one and is never presented as a benchmark result. What was not run is said plainly.

## Consequences and trade-offs

- Records, the changelog and later the benchmark report take longer to write, and read less well than a single headline figure would.
- Pages that compare configurations carry caveats such as "one machine, synthetic text, no sync attached".
- A reader can always tell a measurement from an estimate, and a later measurement can replace an early one without anything having been overstated.
- The gate cannot check this rule. Review does.

## Revisit when

Not as a principle. The wording of caveats may change once the benchmark suite publishes results with a fixed method of its own.
