// The tab's environment and the person's services, handed down the tree; the services are rebuilt when the person changes.
import { markEnd, markStart } from "@manent/perf";
import { applyAppearance, createValue } from "@manent/ui";
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
import type { Navigation } from "../handlers/index.ts";
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

/** Reads the environment when inside an EnvironmentProvider, or null in standalone harnesses. */
export function useOptionalEnvironment(): Environment | null {
  return useContext(EnvironmentContext);
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

/** Reads the active person's services when inside a ServicesProvider, or null in standalone harnesses. */
export function useOptionalServices(): PersonServices | null {
  return useContext(ServicesContext);
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
    environment.personServices.set(services);
    return () => {
      stop();
      environment.personServices.set(null);
      services.dispose();
    };
  }, [built, environment]);
  return built?.services ?? null;
}
