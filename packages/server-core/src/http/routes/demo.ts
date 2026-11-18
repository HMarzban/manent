// The route that tells the web app it runs in demo mode.
import type { DemoResponse } from "@manent/sync-protocol";
import { isLoopbackAddress } from "../../net/bind.ts";
import { failure, json } from "../respond.ts";
import type { Route } from "../route.ts";

export const DEMO_ROUTES: readonly Route[] = [
  {
    method: "GET",
    path: "/api/demo",
    handle({ config, peer }) {
      if (config.demo === null) return failure("not_found", 404);
      return json<DemoResponse>({
        demo: true,
        seedId: config.demo.seedId(),
        // the server control may stop the server, so it is given to this machine only
        control: isLoopbackAddress(peer.remoteAddress)
          ? config.demo.control
          : null,
      });
    },
  },
];
