import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState } from "react";

const COMMANDS = ["Version history", "New scene", "Find", "Export PDF", "Settings"] as const;

// Mod is Command on a Mac and Control elsewhere.
function isModK(event: KeyboardEvent): boolean {
  const mod = navigator.platform.startsWith("Mac") ? event.metaKey : event.ctrlKey;
  return mod && event.key.toLowerCase() === "k";
}

export function Palette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isModK(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function run(command: string) {
    document.body.dataset.ran = command;
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Popup aria-label="Command palette">
          <Autocomplete.Root open inline items={COMMANDS} autoHighlight="always" keepHighlight>
            <Autocomplete.Input aria-label="Search commands" />
            <Autocomplete.List>
              {(command: string) => (
                <Autocomplete.Item key={command} value={command} onClick={() => run(command)}>
                  {command}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
