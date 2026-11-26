import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { scriptDocFromJSON, yXmlFragmentForBinding } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocJSON, GraphicAttrs } from "@manent/schema";
import { schema } from "@manent/schema";
import {
  ID,
  bound,
  docWith,
  flush,
  idOf,
  positionIn,
  twoClients,
  typeInto,
} from "./helpers.ts";

withDom();

const SAMPLE_GRAPHIC: GraphicAttrs = {
  kind: "lower_third",
  assetId: "a".repeat(64),
  heightLines: 4,
  label: "CHYRON 1",
  alt: "Host name card",
  aspectWidth: 1920,
  aspectHeight: 1080,
};

function countGraphicAttrWrites(crdt: CrdtDoc): {
  count(): number;
  reset(): void;
  stop(): void;
} {
  let writes = 0;
  const fragment = yXmlFragmentForBinding(crdt);
  const listener = (events: readonly unknown[]): void => {
    for (const event of events) {
      if (typeof event !== "object" || event === null) continue;
      const attrsChanged: unknown = Reflect.get(event, "attributesChanged");
      if (attrsChanged instanceof Set && attrsChanged.has("graphic")) {
        writes += 1;
        continue;
      }
      const changes: unknown = Reflect.get(event, "changes");
      if (typeof changes === "object" && changes !== null) {
        const keys: unknown = Reflect.get(changes, "keys");
        if (keys instanceof Map && keys.has("graphic")) writes += 1;
      }
    }
  };
  fragment.observeDeep(listener);
  return {
    count: () => writes,
    reset: () => {
      writes = 0;
    },
    stop: () => fragment.unobserveDeep(listener),
  };
}

function graphicDoc(caption = ""): DocJSON {
  return docWith(
    {
      id: ID,
      type: "graphic",
      graphic: { ...SAMPLE_GRAPHIC },
    },
    caption,
  );
}

test("20 caption keystrokes inside a loaded graphic block emit zero attrs.graphic Yjs rewrites", () => {
  const [crdtA, crdtB] = twoClients(graphicDoc(""));
  const viewA = bound(crdtA);
  const viewB = bound(crdtB);
  const writesA = countGraphicAttrWrites(crdtA);
  const writesB = countGraphicAttrWrites(crdtB);

  const phrase = "MARA VANCE, REPORTER";
  expect(phrase.length).toBe(20);
  for (let i = 0; i < phrase.length; i += 1) {
    typeInto(viewA, positionIn(viewA, ID, i), phrase[i]!);
  }
  // Toggle an inline mark and delete one character as well.
  const start = positionIn(viewA, ID, 0);
  viewA.dispatch(
    viewA.state.tr.addMark(start, start + 4, schema.marks.bold.create()),
  );
  viewA.dispatch(viewA.state.tr.delete(start + 19, start + 20));
  flush();

  expect(writesA.count()).toBe(0);
  expect(writesB.count()).toBe(0);
  expect(viewB.state.doc.textContent).toBe("MARA VANCE, REPORTE");
  expect(viewB.state.doc.child(0).child(0).attrs.graphic).toEqual(
    SAMPLE_GRAPHIC,
  );

  writesA.stop();
  writesB.stop();
  viewA.destroy();
  viewB.destroy();
});

test("20 caption keystrokes inside a newly inserted graphic block emit zero attrs.graphic rewrites", () => {
  const [crdtA, crdtB] = twoClients(
    docWith({ id: idOf(0), type: "action" }, "Intro."),
  );
  const viewA = bound(crdtA);
  const viewB = bound(crdtB);

  const graphicId = idOf(1);
  const sectionEnd = viewA.state.doc.child(0).nodeSize - 1;
  const graphicNode = schema.nodes.block.create({
    id: graphicId,
    type: "graphic",
    graphic: { ...SAMPLE_GRAPHIC },
  });
  viewA.dispatch(viewA.state.tr.insert(sectionEnd, graphicNode));
  flush();

  const writesA = countGraphicAttrWrites(crdtA);
  const writesB = countGraphicAttrWrites(crdtB);
  const caption = "LIVE FROM CITY HALL!";
  expect(caption.length).toBe(20);
  for (let i = 0; i < caption.length; i += 1) {
    typeInto(viewA, positionIn(viewA, graphicId, i), caption[i]!);
  }
  flush();

  expect(writesA.count()).toBe(0);
  expect(writesB.count()).toBe(0);
  expect(viewB.state.doc.child(0).child(1).textContent).toBe(caption);
  expect(viewB.state.doc.child(0).child(1).attrs.graphic).toEqual(
    SAMPLE_GRAPHIC,
  );

  writesA.stop();
  writesB.stop();
  viewA.destroy();
  viewB.destroy();
});

test("explicit attrs.graphic update emits one Yjs attribute write, followed by zero on subsequent typing", () => {
  const crdt = scriptDocFromJSON(graphicDoc("Init"), { clientId: 1 });
  const view = bound(crdt);
  const writes = countGraphicAttrWrites(crdt);

  const blockPos = positionIn(view, ID, 0) - 1;
  const updated: GraphicAttrs = { ...SAMPLE_GRAPHIC, heightLines: 8 };
  view.dispatch(view.state.tr.setNodeAttribute(blockPos, "graphic", updated));
  expect(writes.count()).toBe(1);

  writes.reset();
  const extra = "0123456789";
  for (let i = 0; i < extra.length; i += 1) {
    typeInto(view, positionIn(view, ID, 4 + i), extra[i]!);
  }
  expect(writes.count()).toBe(0);
  expect(view.state.doc.child(0).child(0).attrs.graphic).toEqual(updated);

  writes.stop();
  view.destroy();
});
