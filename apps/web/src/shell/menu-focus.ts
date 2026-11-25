// Where focus goes when a pointer chooses in a dropdown menu: back to the menu's trigger, without a ring.
import { useEffect } from "react";

// an item whose press closes the menu: not one that opens a submenu
const CLOSING_ITEM = "[role='menuitem']:not([aria-haspopup])";
const MENU = "[data-slot='dropdown-menu-content']";

/**
 * A pointer choosing an item hands focus to the menu's trigger during that click: the menu's own return of focus, once
 * it has faded out, would draw the ring whenever a key was used before the pointer. Focus the choice has already moved
 * out of the menu stays where it went, as does the focus of a menu closed from the keys.
 */
function returnFocusOnPointerChoice(event: MouseEvent): void {
  // a click made by a key (Enter, Space) counts no presses
  if (event.detail === 0 || !(event.target instanceof Element)) return;
  const menu = event.target.closest(MENU);
  if (menu === null || event.target.closest(CLOSING_ITEM) === null) return;
  const active = document.activeElement;
  if (active !== document.body && !menu.contains(active)) return;
  // the trigger names the menu only while it is open, and by now it has closed; the menu still names its trigger
  const label = menu.getAttribute("aria-labelledby");
  const trigger = label === null ? null : document.getElementById(label);
  if (trigger instanceof HTMLElement)
    trigger.focus({ focusVisible: false, preventScroll: true });
}

/** Every dropdown menu, while the shell is drawn, gives focus back to its trigger after a pointer choice, without a ring. */
export function useMenuChoiceFocus(): void {
  useEffect(() => {
    document.addEventListener("click", returnFocusOnPointerChoice);
    return () =>
      document.removeEventListener("click", returnFocusOnPointerChoice);
  }, []);
}
