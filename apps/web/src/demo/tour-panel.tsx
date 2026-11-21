// The Tour tab: the Tour's groups in order, each with its scenarios.
import { TOUR } from "@manent/demo";
import type { TourScenario, TourWindow } from "@manent/demo";
import { TOUR_WORDS } from "@manent/ui";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { TourScenarioRow } from "./tour-scenario.tsx";

/** `open` with `?person=<userId>` added, which the app reads to make the tab that person. */
function asPerson(place: TourWindow): string {
  const url = new URL(place.open, "http://manent.invalid");
  url.searchParams.set("person", place.userId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A group with no scenario is its heading alone. Never takes focus. */
export function TourPanel(): ReactNode {
  const router = useRouter();
  // the extra windows are opened first, while the press still allows a new window
  const setUp = ({ setup }: TourScenario): void => {
    for (const extra of setup.extraWindows)
      if (window.open(asPerson(extra)) === null)
        throw new Error("the browser refused one of the scenario's windows");
    void router.navigate({ href: asPerson(setup) });
  };
  return (
    <div className="flex flex-col gap-4 p-3">
      <h2 className="text-title">{TOUR_WORDS.title}</h2>
      {TOUR.groups.map((group) => {
        const scenarios = TOUR.scenarios.filter((s) => s.group === group);
        return (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="text-micro font-semibold tracking-wide text-fg-muted uppercase">
              {group}
            </h3>
            {scenarios.length === 0 ? null : (
              <ul className="flex flex-col gap-4">
                {scenarios.map((scenario) => (
                  <TourScenarioRow
                    key={scenario.id}
                    scenario={scenario}
                    setUp={setUp}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
