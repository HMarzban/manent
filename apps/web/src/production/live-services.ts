// Each document's production services, made on its editor's first mount for one person and kept until that
// person's services are disposed. Light on purpose: the entry reads it, and the services load with the editor.
import { createValue, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { ProductionServices } from "./services.ts";

const NOTHING_TO_STOP = (): void => {};

const held = new Map<string, ProductionServices>();
// bumped on every change of `held`, so a hook reads the services again
const changes = createValue(0);

/** The document's services once its editor mounted; null before. */
export function productionServicesFor(
  docId: string,
): ProductionServices | null {
  return held.get(docId) ?? null;
}

/** `productionServicesFor`, read again whenever a document's services are made or disposed. */
export function useProductionServices(
  docId: string | null,
): ProductionServices | null {
  useSubscribable(changes);
  return docId === null ? null : productionServicesFor(docId);
}

/** What `read` gives of the document's services, followed as they are made and disposed; `otherwise` while there are none. */
export function followProductionServices<T>(
  docId: string,
  read: (services: ProductionServices) => Subscribable<T>,
  otherwise: T,
): Subscribable<T> {
  const get = (): T => {
    const services = productionServicesFor(docId);
    return services === null ? otherwise : read(services).get();
  };
  return {
    get,
    subscribe(listener) {
      let stop = NOTHING_TO_STOP;
      const follow = (): void => {
        stop();
        const services = productionServicesFor(docId);
        stop =
          services === null
            ? NOTHING_TO_STOP
            : read(services).subscribe(() => listener(get()));
        listener(get());
      };
      const stopChanges = changes.subscribe(follow);
      follow();
      return () => {
        stop();
        stopChanges();
      };
    },
  };
}

/** The document's services for `userId`, made by `create` the first time; another person's are disposed first. */
export function keepProductionServices(
  docId: string,
  userId: string,
  create: () => ProductionServices,
): ProductionServices {
  const kept = held.get(docId);
  if (kept !== undefined && kept.userId === userId) return kept;
  kept?.dispose();
  const services = create();
  held.set(docId, services);
  changes.set(changes.get() + 1);
  return services;
}

/** Disposes every document's services of `userId`. */
export function disposeProductionServices(userId: string): void {
  for (const [docId, services] of held) {
    if (services.userId !== userId) continue;
    services.dispose();
    held.delete(docId);
  }
  changes.set(changes.get() + 1);
}
