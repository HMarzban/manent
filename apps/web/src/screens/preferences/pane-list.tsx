// The list of Preferences panes: a vertical tab list, and on a narrow window a select above the controls.
import { SECTION_IDS } from "@manent/settings";
import type { SectionId } from "@manent/settings";
import {
  PREFERENCES_WORDS,
  Row,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@manent/ui";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { paneLabels } from "./pane.tsx";

// This device follows a divider, apart from the panes that follow the person
const AFTER_DIVIDER: SectionId = "device";

export function PaneList(props: {
  pane: SectionId;
  onPane(pane: SectionId): void;
}): ReactNode {
  const { pane, onPane } = props;
  const { where } = useEnvironment();
  const labels = paneLabels(where.shell);
  const choose = (value: unknown): void => {
    const chosen = SECTION_IDS.find((id) => id === value);
    if (chosen !== undefined) onPane(chosen);
  };
  return (
    <>
      <Tabs
        orientation="vertical"
        value={pane}
        onValueChange={choose}
        className="hidden sm:flex"
      >
        <TabsList
          variant="line"
          aria-label={PREFERENCES_WORDS.title}
          className="w-full items-stretch"
        >
          {SECTION_IDS.map((id) => (
            <Fragment key={id}>
              {id === AFTER_DIVIDER ? <Separator /> : null}
              {/* the tab keeps its keys and role; the row inside draws it as every list draws its current row */}
              <TabsTrigger
                value={id}
                className="h-auto flex-col items-stretch p-0 text-start font-normal group-data-vertical/tabs:py-0 after:hidden"
              >
                <Row current={id === pane}>{labels[id]}</Row>
              </TabsTrigger>
            </Fragment>
          ))}
        </TabsList>
      </Tabs>
      <div className="sm:hidden">
        <Select
          items={SECTION_IDS.map((id) => ({ value: id, label: labels[id] }))}
          value={pane}
          onValueChange={choose}
        >
          <SelectTrigger
            aria-label={PREFERENCES_WORDS.title}
            className="h-control text-ui"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTION_IDS.map((id) => (
              <Fragment key={id}>
                {id === AFTER_DIVIDER ? <SelectSeparator /> : null}
                <SelectItem value={id}>{labels[id]}</SelectItem>
              </Fragment>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
