import type { TourFile } from "@manent/demo";
import { TEXT } from "../text.ts";

export function TourPanel(props: { tour: TourFile }) {
  const { tour } = props;
  return (
    <aside
      aria-labelledby="tour-heading"
      className="w-72 shrink-0 border-l border-neutral-200 p-4"
    >
      <h2 id="tour-heading" className="text-lg font-semibold">
        {TEXT.tourTitle}
      </h2>
      {tour.groups.map((group) => {
        const scenarios = tour.scenarios.filter((s) => s.group === group);
        return (
          <section key={group} className="mt-4">
            <h3 className="font-medium">{group}</h3>
            {scenarios.length === 0 ? (
              <p className="text-ui text-fg-muted">{TEXT.tourEmptyGroup}</p>
            ) : (
              <ul className="text-ui">
                {scenarios.map((scenario) => (
                  <li key={scenario.id}>{scenario.promise}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </aside>
  );
}
