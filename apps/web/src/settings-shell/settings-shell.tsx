// Shared full-page Settings shell: unified header, responsive left rail / mobile select, scrollable main and status bar.
import {
  Row,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@manent/ui";
import { Fragment, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import {
  BackButton,
  TitleBarAccount,
  TitleBarDivider,
} from "../shell/title-bar-pieces.tsx";
import { SettingsStatusBar } from "./settings-status-bar.tsx";

export interface SettingsNavItem<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly href?: string;
  /** Draw a hairline separator before this item (without inserting invalid non-tab nodes into a tablist). */
  readonly separatedBefore?: boolean;
}

export interface SettingsShellProps<Id extends string = string> {
  readonly backLabel: string;
  readonly backTitle?: string;
  readonly onBack: () => void;
  readonly title: string;
  readonly navLabel: string;
  readonly navMode: "tabs" | "links";
  readonly navItems: readonly SettingsNavItem<Id>[];
  /** Null when an overlay/search/filter view (e.g. Set by you) is active so clicking any tab returns to it. */
  readonly activeNavId: Id | null;
  readonly onSelectNav: (id: Id) => void;
  /** Optional rail header controls (e.g. Preferences Search and Set by you). */
  readonly railTop?: ReactNode;
  /** Ref attached to the `<main>` scrollable container (used by Preferences ArrowDown from Search). */
  readonly mainRef?: RefObject<HTMLElement | null>;
  /** Extra classes applied to the inner `max-w-content` wrapper. */
  readonly contentClassName?: string;
  readonly children: ReactNode;
}

/**
 * Full-page settings frame shared by Preferences, Project settings, and Workspace settings.
 * Preserves the direct `div > header > h1` DOM contract and collapses the left rail at `@[42rem]`
 * (rem-based container width so `150%–200%` interface sizes switch cleanly to the mobile Select).
 */
export function SettingsShell<Id extends string>(
  props: SettingsShellProps<Id>,
): ReactNode {
  const {
    backLabel,
    backTitle,
    onBack,
    title,
    navLabel,
    navMode,
    navItems,
    activeNavId,
    onSelectNav,
    railTop,
    mainRef,
    contentClassName,
    children,
  } = props;
  const fallbackMainRef = useRef<HTMLElement>(null);
  const resolvedMainRef = mainRef ?? fallbackMainRef;

  // Reset scroll position to the top when switching sections without stealing keyboard focus from the rail.
  useEffect(() => {
    if (resolvedMainRef.current !== null) resolvedMainRef.current.scrollTop = 0;
  }, [activeNavId, resolvedMainRef]);

  const choose = (value: unknown): void => {
    const matched = navItems.find((item) => item.id === value);
    if (matched !== undefined) onSelectNav(matched.id);
  };

  const selectValue = activeNavId ?? navItems[0]?.id ?? "";

  return (
    <div className="@container flex min-h-0 flex-1 flex-col bg-chrome">
      <header className="flex min-h-titlebar shrink-0 items-center gap-2 border-b border-line bg-chrome px-2.5 py-1">
        <BackButton
          label={backLabel}
          title={backTitle}
          className="max-w-[45%]"
          onClick={onBack}
        />
        <TitleBarDivider />
        <h1
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-title font-semibold text-fg outline-none"
        >
          {title}
        </h1>
        <TitleBarAccount />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto @[42rem]:flex-row @[42rem]:overflow-hidden">
        <div className="flex shrink-0 flex-col gap-2 border-b border-line p-4 @[42rem]:w-[min(var(--panel-left-w),17rem)] @[42rem]:border-e @[42rem]:border-b-0 @[42rem]:px-2.5">
          {railTop}
          {navMode === "tabs" ? (
            <Tabs
              orientation="vertical"
              value={activeNavId}
              onValueChange={choose}
              className="hidden @[42rem]:flex"
            >
              <TabsList
                variant="line"
                aria-label={navLabel}
                className="w-full items-stretch gap-0.5"
              >
                {navItems.map((item) => (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className={cn(
                      "h-auto cursor-pointer flex-col items-stretch p-0 text-start font-normal group-data-vertical/tabs:py-0 after:hidden",
                      item.separatedBefore &&
                        "mt-2 before:absolute before:inset-x-0 before:-top-1 before:h-px before:bg-border",
                    )}
                  >
                    <Row current={item.id === activeNavId} leading={item.icon}>
                      {item.label}
                    </Row>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <nav
              aria-label={navLabel}
              className="hidden flex-col gap-0.5 @[42rem]:flex"
            >
              {navItems.map((item) => {
                const current = item.id === activeNavId;
                return (
                  <a
                    key={item.id}
                    href={item.href ?? "#"}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "block cursor-pointer rounded-control no-underline",
                      item.separatedBefore && "mt-2 border-t border-line pt-2",
                    )}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelectNav(item.id);
                    }}
                  >
                    <Row leading={item.icon}>{item.label}</Row>
                  </a>
                );
              })}
            </nav>
          )}
          <div className="@[42rem]:hidden">
            <Select
              items={navItems.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              value={selectValue}
              onValueChange={choose}
            >
              <SelectTrigger
                aria-label={navLabel}
                className="h-control w-full text-ui"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {navItems.map((item) => (
                  <Fragment key={item.id}>
                    {item.separatedBefore ? <SelectSeparator /> : null}
                    <SelectItem value={item.id}>{item.label}</SelectItem>
                  </Fragment>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <main
          ref={resolvedMainRef}
          className="min-w-0 flex-1 p-4 @[42rem]:overflow-auto @[42rem]:p-6"
        >
          <div className={cn("max-w-content", contentClassName)}>
            {children}
          </div>
        </main>
      </div>
      <SettingsStatusBar />
    </div>
  );
}
