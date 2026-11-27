import { expect, test } from "bun:test";
import {
  TOUR,
  TOUR_HIGHLIGHTS,
  TOUR_TRACKS,
  findTourTrack,
  isShown,
} from "../src/index.ts";

test("every Tour highlight and story track scenario is active and web-runnable", () => {
  const byId = new Map(TOUR.scenarios.map((s) => [s.id, s]));
  expect(TOUR_HIGHLIGHTS.length).toBe(6);

  for (const id of TOUR_HIGHLIGHTS) {
    const scenario = byId.get(id);
    expect(scenario).toBeDefined();
    expect(isShown(scenario!)).toBe(true);
    expect(scenario!.setup.shell).toBe("any");
  }

  for (const track of TOUR_TRACKS) {
    expect(findTourTrack(track.id)).toBe(track);
    expect(track.scenarioIds.length).toBeGreaterThanOrEqual(3);
    expect(new Set(track.scenarioIds).size).toBe(track.scenarioIds.length);
    for (const id of track.scenarioIds) {
      const scenario = byId.get(id);
      expect(scenario).toBeDefined();
      expect(isShown(scenario!)).toBe(true);
      expect(scenario!.setup.shell).toBe("any");
    }
  }
});
