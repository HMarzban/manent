// A panel's tab row with its close button, and the current tab's content.
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../stock/tabs.tsx";
import { CloseButton } from "./close-button.tsx";

interface PanelTabsProps {
  label: string;
  tabs: readonly { id: string; label: string }[];
  current: string;
  onChange(id: string): void;
  onClose(): void;
  /** The close button's accessible name ("Close side panel"). */
  closeLabel: string;
  children: ReactNode;
}

/** The tab row is drawn even for one tab, so a panel always says what it holds. */
export function PanelTabs({
  label,
  tabs,
  current,
  onChange,
  onClose,
  closeLabel,
  children,
}: PanelTabsProps): ReactNode {
  return (
    <Tabs value={current} onValueChange={onChange} className="h-full gap-0">
      <div className="flex h-tabs items-center gap-1 border-b border-line px-2">
        <TabsList
          variant="line"
          aria-label={label}
          className="min-w-0 flex-1 justify-start"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-tour={`tab:${tab.id}`}
              className="min-w-0 flex-initial px-2 text-ui"
            >
              <span className="truncate" title={tab.label}>
                {tab.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <CloseButton label={closeLabel} onClick={onClose} />
      </div>
      <TabsContent value={current} className="min-h-0 overflow-auto">
        {children}
      </TabsContent>
    </Tabs>
  );
}
