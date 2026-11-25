// Which label of a project's draft ladder a draft's name uses.

/** The label of `ladder` the draft named `name` uses: one the name equals, or equals followed by " draft"; null for none. */
export function ladderLabelOf(
  name: string,
  ladder: readonly string[],
): string | null {
  return (
    ladder.find((label) => name === label || name === `${label} draft`) ?? null
  );
}
