// Closed word lists used by the script checks: English function words skipped by overused-word detection,
// calendar words skipped by proper-noun detection, and title abbreviations that never end a sentence.

const wordSet = (raw: string): ReadonlySet<string> =>
  new Set(
    raw
      .trim()
      .split(/\s+/u)
      .filter((word) => word !== ""),
  );

/** Common English function and filler words excluded from the overused-words check. */
export const OVERUSED_STOP_WORDS: ReadonlySet<string> = wordSet(`
  about above across after again against all almost alone along already also although always among and another any
  anyone anything anywhere are around away back because been before behind being below beneath beside between beyond
  both but came can cannot come comes could did does doing done down during each either else enough even ever every everyone
  everything everywhere few find first five for four from get gets getting give given gives goes going gone good got
  great had has have having her here hers herself him himself his how however into its itself just keep keeps kept
  know known knows last leave leaves left less let like likely little long look looks made make makes many may maybe
  might mine more most much must myself near need needs never new next night nine none nor not nothing now off often
  once one only onto other others our ours ourselves out outside over own part past people perhaps place put quite
  rather really right said same saw say says see seem seemed seems seen self set seven several shall she should show
  side since six some someone something sometimes somewhere soon still such sure take taken takes tell tells ten than
  that the their theirs them themselves then there these they thing things think thinks this those though three through
  time today together told too took toward towards try turn two under until upon use used uses using very want wants
  was way ways well went were what whatever when where whether which while who whom whose why will with within without
  would yes yet you your yours yourself yourselves
`);

/** Capitalised calendar words excluded from the new proper nouns check. */
export const NON_PROPER_NOUNS: ReadonlySet<string> = wordSet(`
  monday tuesday wednesday thursday friday saturday sunday
  january february march april may june july august september october november december
`);

/** Title abbreviations (lower case, without their dot) whose full stop never ends a sentence and joins the name after it. */
export const TITLE_ABBREVIATIONS: ReadonlySet<string> = wordSet(`
  dr mr mrs ms prof rev sgt lt capt col gen st
`);
