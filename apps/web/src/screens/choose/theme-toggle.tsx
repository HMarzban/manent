// Masthead Light / Dark theme switch on Choose who you are: native radio pills wired to the radial iris transition.
import { APPEARANCE_STUDIO_WORDS, CHOOSE_WORDS } from "@manent/ui";
import { MoonIcon, SunIcon } from "lucide-react";
import {
  useCallback,
  useContext,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { writeBootCache } from "../../boot/boot-cache.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { FactsContext } from "../../state/bridge-contexts.ts";
import { runAppearanceTransition } from "../preferences/view-transition.ts";

const DARK_MEDIA = "(prefers-color-scheme: dark)";

type Scheme = "light" | "dark";

function readEffectiveScheme(): Scheme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia(DARK_MEDIA).matches ? "dark" : "light";
  }
  return "light";
}

function useSystemDark(): boolean {
  const subscribe = useCallback((listener: () => void) => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return () => {};
    const list = window.matchMedia(DARK_MEDIA);
    list.addEventListener("change", listener);
    return () => list.removeEventListener("change", listener);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DARK_MEDIA).matches,
  );
}

function ThemeToggleControl(props: {
  scheme: Scheme;
  onSelect(next: Scheme, originEl: HTMLElement | null): void;
}): ReactNode {
  const { scheme, onSelect } = props;
  const groupName = useId();
  const options: readonly { value: Scheme; label: string }[] = [
    { value: "light", label: APPEARANCE_STUDIO_WORDS.lightMode },
    { value: "dark", label: APPEARANCE_STUDIO_WORDS.darkMode },
  ];

  return (
    <fieldset
      className="mn-choose-theme"
      aria-label={CHOOSE_WORDS.themeSwitchLabel}
    >
      <legend className="sr-only">{CHOOSE_WORDS.themeSwitchLabel}</legend>
      {options.map((opt) => {
        const active = scheme === opt.value;
        return (
          <label
            key={opt.value}
            className="mn-choose-theme-opt"
            data-active={active ? "true" : undefined}
          >
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={active}
              className="sr-only"
              onChange={(event) => {
                onSelect(opt.value, event.currentTarget.parentElement);
              }}
            />
            {opt.value === "light" ? (
              <SunIcon
                aria-hidden="true"
                className="mn-choose-theme-icon size-icon shrink-0"
              />
            ) : (
              <MoonIcon
                aria-hidden="true"
                className="mn-choose-theme-icon size-icon shrink-0"
              />
            )}
            <span>{opt.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Inside the shell (switching person), reads and writes the signed-in person's appearance.theme setting. */
function SignedInThemeToggle(): ReactNode {
  const { settings } = useServices();
  const systemDark = useSystemDark();
  const themeSetting = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        settings.subscribe("appearance.theme", listener),
      [settings],
    ),
    () => settings.get("appearance.theme"),
  );
  const scheme: Scheme =
    themeSetting === "system" ? (systemDark ? "dark" : "light") : themeSetting;

  const onSelect = (next: Scheme, originEl: HTMLElement | null): void => {
    if (themeSetting === next) return;
    if (scheme === next) {
      settings.set("appearance.theme", next);
      return;
    }
    runAppearanceTransition({
      originEl,
      kind: "iris",
      mutate: () => {
        settings.set("appearance.theme", next);
      },
    });
  };

  return <ThemeToggleControl scheme={scheme} onSelect={onSelect} />;
}

/** Before sign-in, updates html[data-theme] and boot cache directly with the radial iris transition. */
function PreSignInThemeToggle(): ReactNode {
  const { tabStorage } = useEnvironment();
  const systemDark = useSystemDark();
  const [picked, setPicked] = useState<Scheme | null>(() => {
    if (typeof document === "undefined") return null;
    const attr = document.documentElement.getAttribute("data-theme");
    return attr === "light" || attr === "dark" ? attr : null;
  });

  const scheme: Scheme =
    picked ?? (systemDark ? "dark" : readEffectiveScheme());

  const onSelect = (next: Scheme, originEl: HTMLElement | null): void => {
    if (scheme === next && picked === next) return;
    const apply = (): void => {
      const root = document.documentElement;
      root.setAttribute("data-theme", next);
      writeBootCache(tabStorage, [
        ["a", "data-theme", next],
        ["a", "data-palette", root.getAttribute("data-palette")],
        ["a", "data-white-page", root.getAttribute("data-white-page")],
        ["a", "data-gems", root.getAttribute("data-gems")],
        ["a", "data-ui-size", root.getAttribute("data-ui-size")],
      ]);
      setPicked(next);
    };
    if (scheme === next) {
      apply();
      return;
    }
    runAppearanceTransition({ originEl, kind: "iris", mutate: apply });
  };

  return <ThemeToggleControl scheme={scheme} onSelect={onSelect} />;
}

export function ThemeToggle(): ReactNode {
  const inShell = useContext(FactsContext) !== null;
  return inShell ? <SignedInThemeToggle /> : <PreSignInThemeToggle />;
}
