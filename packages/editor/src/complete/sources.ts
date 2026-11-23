// The sources autocomplete asks at the caret, one per line, in the order their offers are listed.
import { projectNamesSource } from "./project-names.ts";
import { MAX_SUGGESTIONS, scriptNamesSource } from "./suggest.ts";
import type {
  CompletionInput,
  CompletionSource,
  Suggestions,
} from "./suggest.ts";

export const COMPLETION_SOURCES: readonly CompletionSource[] = Object.freeze([
  scriptNamesSource,
  projectNamesSource,
]);

/**
 * The first source's offer, with the items of each later offer over the same text and with the same next step added
 * after its own, each once and at most MAX_SUGGESTIONS; an offer over other text is passed over. Null: no source offers.
 */
export function suggestFromSources(input: CompletionInput): Suggestions | null {
  const offers = COMPLETION_SOURCES.map((source) => source(input)).filter(
    (offer) => offer !== null,
  );
  const [first] = offers;
  if (first === undefined) return null;
  const items = offers
    .filter(
      (offer) =>
        offer.from === first.from &&
        offer.to === first.to &&
        offer.next === first.next,
    )
    .flatMap((offer) => offer.items);
  return { ...first, items: [...new Set(items)].slice(0, MAX_SUGGESTIONS) };
}
