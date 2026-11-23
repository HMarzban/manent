// The drag and drop around one or more sortable lists: its sensors, its words and where the drop indicator goes.
import {
  Accessibility,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import { SORTABLE_WORDS } from "../../words/sortable.ts";
import { createAnnouncer } from "./announcer.ts";
import type { Announcer } from "./announcer.ts";
import { dropMarkOf, isSamePlace, landingOf, placeOf } from "./landing.ts";
import type { DropMark, EntryList, Place } from "./landing.ts";

const DRAG_DISTANCE_PX = 5;
const TOUCH_HOLD_MS = 250;
const TOUCH_TOLERANCE_PX = 5;

// a click opens a row, so a mouse drags only once it has moved; a finger holds first, so the list still scrolls
const SENSORS = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [
            new PointerActivationConstraints.Delay({
              value: TOUCH_HOLD_MS,
              tolerance: TOUCH_TOLERANCE_PX,
            }),
          ]
        : [
            new PointerActivationConstraints.Distance({
              value: DRAG_DISTANCE_PX,
            }),
          ],
  }),
  KeyboardSensor,
];

// the lists change as the item is dropped, so it lands at once; an animation that does nothing (rather than none)
// keeps the library's step that gives focus back to the item after a keyboard drop
const landAtOnce = (): void => {};
const FEEDBACK = Feedback.configure({ dropAnimation: landAtOnce });

const idOf = (entity: { id: string | number } | null): string | null =>
  entity === null ? null : String(entity.id);

// every sentence a person hears is the component's: the library's own are replaced
const accessibilityFor = (announcer: Announcer) =>
  Accessibility.configure({
    screenReaderInstructions: { draggable: SORTABLE_WORDS.instructions },
    announcements: {
      dragstart: ({ operation }: DragStartEvent) =>
        announcer.start(idOf(operation.source)) ?? undefined,
      dragover: ({ operation }: DragOverEvent) =>
        announcer.over(idOf(operation.target)) ?? undefined,
      dragend: ({ operation, canceled }: DragEndEvent) =>
        announcer.end(idOf(operation.target), canceled) ?? undefined,
    },
  });

type Dragging = "pointer" | "keyboard";

const isKeyboard = (event: Event | null): boolean =>
  event instanceof KeyboardEvent;

const DropMarkContext = createContext<DropMark | null>(null);

/** The item (or empty list) the drop indicator is drawn on while an item is dragged. */
export function useDropMark(): DropMark | null {
  return useContext(DropMarkContext);
}

interface Landing {
  itemId: string;
  from: Place;
  to: Place;
}

const landingIn = (
  lists: readonly EntryList[],
  { operation }: DragOverEvent | DragEndEvent,
): Landing | null => {
  const itemId = idOf(operation.source);
  const targetId = idOf(operation.target);
  const from = itemId === null ? null : placeOf(lists, itemId);
  if (itemId === null || targetId === null || from === null) return null;
  const to = landingOf(lists, from, targetId);
  return to === null ? null : { itemId, from, to };
};

interface SortableAreaProps {
  lists: readonly EntryList[];
  /** Called once per drop that changes an item's place. */
  onDrop(itemId: string, from: Place, to: Place): void;
  /** The element around the lists, for a list that brings a moved item into view. */
  area?: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}

export function SortableArea({
  lists,
  onDrop,
  area,
  className,
  children,
}: SortableAreaProps): ReactNode {
  const latest = useRef(lists);
  useLayoutEffect(() => {
    latest.current = lists;
  }, [lists]);
  const [accessibility] = useState(() =>
    accessibilityFor(createAnnouncer({ lists: () => latest.current })),
  );
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [mark, setMark] = useState<DropMark | null>(null);

  const onDragOver = (event: DragOverEvent): void => {
    const { activatorEvent, target } = event.operation;
    // the library scrolls by layout offsets, which a virtual row's transform hides from it; this runs before it
    // measures where the target now is
    if (isKeyboard(activatorEvent))
      target?.element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const landing = landingIn(lists, event);
    setMark(
      landing === null ? null : dropMarkOf(lists, landing.from, landing.to),
    );
  };
  const onDragEnd = (event: DragEndEvent): void => {
    setDragging(null);
    setMark(null);
    const landing = event.canceled ? null : landingIn(lists, event);
    if (landing === null || isSamePlace(landing.from, landing.to)) return;
    onDrop(landing.itemId, landing.from, landing.to);
  };
  // while an item is dragged its keys are the drag's: the list around it must not move focus or scroll as well
  const onKeyDownCapture = (event: ReactKeyboardEvent): void => {
    if (dragging !== null) event.stopPropagation();
  };

  return (
    <DragDropProvider
      sensors={SENSORS}
      plugins={(defaults) => [...defaults, accessibility, FEEDBACK]}
      onDragStart={({ operation }) =>
        setDragging(
          isKeyboard(operation.activatorEvent) ? "keyboard" : "pointer",
        )
      }
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <DropMarkContext value={mark}>
        <div
          ref={area}
          data-dragging={dragging ?? undefined}
          className={className}
          onKeyDownCapture={onKeyDownCapture}
        >
          {children}
        </div>
      </DropMarkContext>
    </DragDropProvider>
  );
}
