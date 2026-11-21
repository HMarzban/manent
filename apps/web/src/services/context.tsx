// The tab's environment and the person's services, handed down the tree; the services are rebuilt when the person changes.
import { markEnd, markStart } from "@manent/perf";
import {
  EDITOR_WORDS,
  LIBRARY_WORDS,
  applyAppearance,
  createValue,
} from "@manent/ui";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Api } from "../api.ts";
import { writeBootCache } from "../boot/boot-cache.ts";
import { installDesktopClose } from "../desktop/desktop-close.ts";
import { watchRefusedFiles } from "../desktop/file-messages.ts";
import type { DesktopHost } from "../desktop/host.ts";
import type { Navigation } from "../handlers/index.ts";
import { sendPath } from "../screens/send/form-ids.ts";
import type { TabPerson } from "../session.ts";
import type { PersonStore } from "../state/person.store.ts";
import type { PersonServices } from "./ports.ts";
import { createPersonServices } from "./services.ts";
import type { Environment } from "./ports.ts";

const EnvironmentContext = createContext<Environment | null>(null);
const ServicesContext = createContext<PersonServices | null>(null);

export function EnvironmentProvider(props: {
  environment: Environment;
  children: ReactNode;
}): ReactNode {
  return (
    <EnvironmentContext.Provider value={props.environment}>
      {props.children}
    </EnvironmentContext.Provider>
  );
}

/** Throws a TypeError outside an EnvironmentProvider. */
export function useEnvironment(): Environment {
  const environment = useContext(EnvironmentContext);
  if (environment === null)
    throw new TypeError("the environment was read outside its provider");
  return environment;
}

export function ServicesProvider(props: {
  services: PersonServices;
  children: ReactNode;
}): ReactNode {
  return (
    <ServicesContext.Provider value={props.services}>
      {props.children}
    </ServicesContext.Provider>
  );
}

/** Throws a TypeError outside a ServicesProvider. */
export function useServices(): PersonServices {
  const services = useContext(ServicesContext);
  if (services === null)
    throw new TypeError("the services were read outside their provider");
  return services;
}

const pathOf = (href: string): string =>
  new URL(href, "http://manent.invalid").pathname;

/** The person's answers to the desktop app's shell: the window's close, and the files it refused to open. */
function answerShell(
  desktop: DesktopHost,
  services: PersonServices,
  environment: Environment,
  router: Navigation,
): () => void {
  // the open script is the one Export writes
  const shown = (): string => environment.shellState.get().docId ?? "";
  const stops = [
    installDesktopClose({
      host: desktop,
      guard: services.closing.guard,
      queue: services.messages,
      exportedText: () =>
        EDITOR_WORDS.send.exported(
          services.library.documentTitle(shown()).get() ??
            LIBRARY_WORDS.untitledScript,
        ),
      // the shell writes its state after every move between screens
      routeChanges: (listener) =>
        environment.shellState.subscribe(() =>
          listener(pathOf(router.here().href)),
        ),
      exportPath: () => sendPath(shown(), "export"),
    }),
    watchRefusedFiles({ host: desktop, queue: services.messages }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * The services of `person`, null while there is none. A new person's services are built while rendering and their
 * appearance is written before the frame is drawn; the previous person's are disposed in the same task. `demo` may
 * change under the same services: the demo's answer can arrive after the person is drawn.
 */
export function usePersonServices(options: {
  person: TabPerson | null;
  demo: boolean;
  api: Api;
  usePerson: PersonStore;
  router: Navigation;
}): PersonServices | null {
  const environment = useEnvironment();
  const { person, demo, api, usePerson, router } = options;
  const userId = person?.userId ?? null;
  const token = person?.token ?? null;
  const [demoValue] = useState(() => createValue(demo));
  useLayoutEffect(() => demoValue.set(demo), [demoValue, demo]);
  const built = useMemo(
    () =>
      person === null
        ? null
        : {
            startedAt: markStart(),
            services: createPersonServices({
              ...environment,
              person,
              demo: demoValue,
              api,
              usePerson,
              router,
            }),
          },
    // signing in starts the person's services again with the token; a new name keeps them, and the store is read for it
    [userId, token, demoValue, environment, api, usePerson, router],
  );
  useLayoutEffect(() => {
    if (built === null) return;
    const { services, startedAt } = built;
    const stop = applyAppearance({
      store: services.settings,
      root: document.documentElement,
      frame: environment.frame,
      onBootWrites(writes) {
        writeBootCache(environment.tabStorage, writes);
        environment.desktop?.firstPaint(writes);
      },
    });
    markEnd("ui.switch.person", startedAt);
    const { desktop } = environment;
    const stopAnswering =
      desktop === null
        ? null
        : answerShell(desktop, services, environment, router);
    return () => {
      stop();
      stopAnswering?.();
      services.dispose();
    };
  }, [built, environment, router]);
  return built?.services ?? null;
}
