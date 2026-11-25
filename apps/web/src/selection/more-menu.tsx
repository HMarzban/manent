// Structured overflow menu of the selection toolbar: inline styles, colour and highlight swatches, paragraph layout and actions.
import type { CommandId, CommandService } from "@manent/commands";
import type { Platform } from "@manent/settings";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  SELECTION_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  keyLabel,
  useCommands,
} from "@manent/ui";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import type { SelectionMarks } from "../editor-host/selection-marks.ts";
import { useEnvironment } from "../services/context.tsx";
import type { FactsSelectors } from "../state/facts.store.ts";
import {
  iconForAction,
  iconForCommand,
  isCommandActive,
} from "./selection-icons.tsx";
import type {
  SelectionActionContext,
  SelectionCommandSlot,
  SelectionSlot,
} from "./slots.ts";

const INLINE_STYLE_COMMANDS: ReadonlySet<CommandId> = new Set([
  "format.strike",
  "format.caps",
]);

const PARAGRAPH_COMMANDS: ReadonlySet<CommandId> = new Set([
  "format.alignLeft",
  "format.alignCenter",
  "format.alignRight",
  "format.spaceBefore",
]);

const TEXT_SWATCHES: Readonly<Partial<Record<CommandId, string>>> = {
  "format.colour.none": "text-none",
  "format.colour.red": "text-red",
  "format.colour.orange": "text-orange",
  "format.colour.green": "text-green",
  "format.colour.blue": "text-blue",
  "format.colour.violet": "text-violet",
};

const HIGHLIGHT_SWATCHES: Readonly<Partial<Record<CommandId, string>>> = {
  "format.highlight.none": "hl-none",
  "format.highlight.yellow": "hl-yellow",
  "format.highlight.green": "hl-green",
  "format.highlight.pink": "hl-pink",
  "format.highlight.orange": "hl-orange",
  "format.highlight.violet": "hl-violet",
};

interface SwatchEntry {
  readonly id: CommandId;
  readonly swatch: string;
}

interface GroupedMore {
  readonly inlineStyles: readonly CommandId[];
  readonly textColours: readonly SwatchEntry[];
  readonly highlights: readonly SwatchEntry[];
  readonly paragraph: readonly CommandId[];
  readonly other: readonly SelectionSlot[];
}

const isCommandSlot = (slot: SelectionSlot): slot is SelectionCommandSlot =>
  "command" in slot;

function groupMoreSlots(slots: readonly SelectionSlot[]): GroupedMore {
  const inlineStyles: CommandId[] = [];
  const textColours: SwatchEntry[] = [];
  const highlights: SwatchEntry[] = [];
  const paragraph: CommandId[] = [];
  const other: SelectionSlot[] = [];

  for (const slot of slots) {
    if (!isCommandSlot(slot)) {
      other.push(slot);
      continue;
    }
    const id = slot.command;
    const textSwatch = TEXT_SWATCHES[id];
    const hlSwatch = HIGHLIGHT_SWATCHES[id];
    if (INLINE_STYLE_COMMANDS.has(id)) inlineStyles.push(id);
    else if (textSwatch !== undefined)
      textColours.push({ id, swatch: textSwatch });
    else if (hlSwatch !== undefined) highlights.push({ id, swatch: hlSwatch });
    else if (PARAGRAPH_COMMANDS.has(id)) paragraph.push(id);
    else other.push(slot);
  }
  return { inlineStyles, textColours, highlights, paragraph, other };
}

function CommandRow(props: {
  id: CommandId;
  service: CommandService;
  platform: Platform;
  marks: SelectionMarks;
  facts: FactsSelectors | null;
  onApplied: () => void;
}): ReactNode {
  const { id, service, platform, marks, facts, onApplied } = props;
  const state = service.state(id);
  const active = isCommandActive(id, marks, facts);
  const [chord] = state.keys;
  return (
    <DropdownMenuItem
      onClick={() => {
        service.run(id, "menu");
        onApplied();
      }}
    >
      {iconForCommand(id)}
      <span className="flex-1">{state.label}</span>
      {active === true ? (
        <CheckIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-accent"
        />
      ) : null}
      {chord === undefined ? null : <Kbd>{keyLabel(chord, platform)}</Kbd>}
    </DropdownMenuItem>
  );
}

function SwatchStrip(props: {
  heading: string;
  entries: readonly SwatchEntry[];
  clearSwatch: string;
  service: CommandService;
  marks: SelectionMarks;
  facts: FactsSelectors | null;
  onApplied: () => void;
}): ReactNode {
  const { heading, entries, clearSwatch, service, marks, facts, onApplied } =
    props;
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="px-2 py-1">{heading}</DropdownMenuLabel>
      <div className="grid grid-cols-6 gap-1 px-1.5 py-1">
        {entries.map(({ id, swatch }) => {
          const { label } = service.state(id);
          const active = isCommandActive(id, marks, facts) === true;
          const isNone = swatch === clearSwatch;
          return (
            <DropdownMenuItem
              key={id}
              className="mn-swatch-item flex size-7 items-center justify-center rounded-full p-0"
              aria-label={label}
              title={label}
              onClick={() => {
                service.run(id, "menu");
                onApplied();
              }}
            >
              <span
                className="mn-swatch"
                data-swatch={swatch}
                data-active={active ? "" : undefined}
              >
                {isNone ? (
                  <BanIcon aria-hidden="true" className="size-3" />
                ) : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </div>
    </DropdownMenuGroup>
  );
}

/** Overflow menu for secondary formatting, visual colour and highlight palettes, alignment and selection actions. */
export function MoreMenu(props: {
  more: readonly SelectionSlot[];
  marks: SelectionMarks;
  facts: FactsSelectors | null;
  actionContext: SelectionActionContext | null;
  onApplied: () => void;
}): ReactNode {
  const { more, marks, facts, actionContext, onApplied } = props;
  const { dom } = useEnvironment();
  const { service, platform } = useCommands();
  const [open, setOpen] = useState(false);

  const grouped = groupMoreSlots(more);
  const sections: { key: string; content: ReactNode }[] = [];

  if (grouped.inlineStyles.length > 0) {
    sections.push({
      key: "inline",
      content: grouped.inlineStyles.map((id) => (
        <CommandRow
          key={id}
          id={id}
          service={service}
          platform={platform}
          marks={marks}
          facts={facts}
          onApplied={onApplied}
        />
      )),
    });
  }

  if (grouped.textColours.length > 0) {
    sections.push({
      key: "text-colour",
      content: (
        <SwatchStrip
          heading={SELECTION_WORDS.textColour}
          entries={grouped.textColours}
          clearSwatch="text-none"
          service={service}
          marks={marks}
          facts={facts}
          onApplied={onApplied}
        />
      ),
    });
  }

  if (grouped.highlights.length > 0) {
    sections.push({
      key: "highlight",
      content: (
        <SwatchStrip
          heading={SELECTION_WORDS.highlight}
          entries={grouped.highlights}
          clearSwatch="hl-none"
          service={service}
          marks={marks}
          facts={facts}
          onApplied={onApplied}
        />
      ),
    });
  }

  if (grouped.paragraph.length > 0) {
    sections.push({
      key: "paragraph",
      content: grouped.paragraph.map((id) => (
        <CommandRow
          key={id}
          id={id}
          service={service}
          platform={platform}
          marks={marks}
          facts={facts}
          onApplied={onApplied}
        />
      )),
    });
  }

  const otherNodes = grouped.other.flatMap((slot): ReactNode[] => {
    if (isCommandSlot(slot)) {
      return [
        <CommandRow
          key={slot.command}
          id={slot.command}
          service={service}
          platform={platform}
          marks={marks}
          facts={facts}
          onApplied={onApplied}
        />,
      ];
    }
    if (actionContext === null) return [];
    return [
      <DropdownMenuItem
        key={slot.id}
        onClick={() => {
          slot.run(actionContext);
          onApplied();
        }}
      >
        {iconForAction(slot.id)}
        <span className="flex-1">{slot.label}</span>
      </DropdownMenuItem>,
    ];
  });

  if (otherNodes.length > 0) {
    sections.push({ key: "other", content: otherNodes });
  }

  if (sections.length === 0) return null;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        setOpen(next);
        if (!next && details.reason !== "outside-press") dom.focusPage();
      }}
    >
      <Tooltip disabled={open}>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="group/more-trigger gap-1 px-2"
                  aria-label={SELECTION_WORDS.more}
                />
              }
            />
          }
        >
          <EllipsisIcon
            aria-hidden="true"
            className="size-icon text-fg-muted group-hover/more-trigger:text-fg"
          />
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-3 text-fg-muted motion-safe:transition-transform duration-(--dur-fast) ease-out group-hover/more-trigger:text-fg",
              open && "rotate-180",
            )}
          />
        </TooltipTrigger>
        <TooltipContent>{SELECTION_WORDS.more}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        data-selection-toolbar=""
        finalFocus={false}
        className="min-w-48"
      >
        {sections.map((section, index) => (
          <Fragment key={section.key}>
            {index === 0 ? null : <DropdownMenuSeparator />}
            {section.content}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
