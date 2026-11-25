import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  FormatError,
  MOS_MAX_MESSAGE_BYTES,
  MOS_MAX_XML_DEPTH,
  buildHeartbeat,
  buildRoAck,
  buildRoCreate,
  buildRoDelete,
  buildRoElementAction,
  buildRoListAll,
  buildRoReq,
  buildRoStorySend,
  createMosFramer,
  decodeMosMessage,
  decodeUtf16Be,
  encodeMosMessage,
  encodeUtf16Be,
  formatMosMessage,
  parseMosMessage,
  parseMosXml,
  writeMosXml,
} from "../src/index.ts";
import type { MosMessage } from "../src/index.ts";

test("UTF-16BE encodes and decodes ASCII, BMP and surrogate pairs accurately", () => {
  const sample = 'Hello Écran 👁 𠀀 <mos> & "quotes"';
  const bytes = encodeUtf16Be(sample);
  expect(bytes.byteLength).toBe(sample.length * 2);
  // First code unit 'H' = 0x0048 in big-endian
  expect([bytes[0], bytes[1]]).toEqual([0x00, 0x48]);
  // Surrogate pair '👁' (U+1F441 -> 0xD83D 0xDC41)
  const eyeAt = sample.indexOf("👁") * 2;
  expect([
    bytes[eyeAt],
    bytes[eyeAt + 1],
    bytes[eyeAt + 2],
    bytes[eyeAt + 3],
  ]).toEqual([0xd8, 0x3d, 0xdc, 0x41]);
  expect(decodeUtf16Be(bytes)).toBe(sample);
});

test("UTF-16BE rejects odd byte lengths and unpaired surrogates", () => {
  expect(() => decodeUtf16Be(new Uint8Array([0x00, 0x41, 0x00]))).toThrow(
    FormatError,
  );
  expect(() => encodeUtf16Be("bad\uD800")).toThrow(FormatError);
  expect(() => encodeUtf16Be("\uDC00bad")).toThrow(FormatError);
  expect(() => decodeUtf16Be(new Uint8Array([0xd8, 0x00, 0x00, 0x41]))).toThrow(
    FormatError,
  );
  expect(() => decodeUtf16Be(new Uint8Array([0xdc, 0x00, 0x00, 0x41]))).toThrow(
    FormatError,
  );
});

test("MOS UTF-16BE framer reassembles odd-byte TCP splits, surrogate pairs and concatenated messages", () => {
  const msg1 = formatMosMessage({
    kind: "heartbeat",
    mosId: "prompter.studio",
    ncsId: "manent.ncs",
    messageId: 1,
    time: "2026-11-25T21:00:00Z",
  });
  const msg2 = formatMosMessage({
    kind: "roStorySend",
    mosId: "prompter.studio",
    ncsId: "manent.ncs",
    messageId: 2,
    roId: "ro-1",
    storyId: "row-1",
    storySlug: "1  LIVE 🎬",
    paragraphs: ["ANCHOR", "Good evening — 👁 & <live>."],
  });
  // Include leading BOM and whitespace between messages
  const bom = new Uint8Array([0xfe, 0xff]);
  const b1 = encodeUtf16Be(`${msg1}\n  `);
  const b2 = encodeUtf16Be(msg2);
  const stream = new Uint8Array(bom.length + b1.length + b2.length);
  stream.set(bom, 0);
  stream.set(b1, bom.length);
  stream.set(b2, bom.length + b1.length);

  // Feed 1 byte at a time (every code unit, surrogate pair and </mos> is split on odd boundaries)
  const framer1 = createMosFramer();
  const out1: string[] = [];
  for (let i = 0; i < stream.length; i += 1) {
    out1.push(...framer1.push(stream.subarray(i, i + 1)));
  }
  expect(out1).toEqual([msg1, msg2]);
  expect(framer1.pendingBytes()).toBe(0);

  // Feed 3 bytes at a time (odd chunk size)
  const framer3 = createMosFramer();
  const out3: string[] = [];
  for (let i = 0; i < stream.length; i += 3) {
    out3.push(...framer3.push(stream.subarray(i, i + 3)));
  }
  expect(out3).toEqual([msg1, msg2]);
  expect(framer3.pendingBytes()).toBe(0);

  // Feed all in a single chunk
  const framerAll = createMosFramer();
  expect(framerAll.push(stream)).toEqual([msg1, msg2]);
});

test("MOS framer enforces 1 MiB message byte limit", () => {
  expect(MOS_MAX_MESSAGE_BYTES).toBe(1024 * 1024);
  const smallFramer = createMosFramer({ maxBytes: 64 });
  const oversized = encodeUtf16Be(`<mos>${"a".repeat(40)}</mos>`);
  expect(() => smallFramer.push(oversized)).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
});

test("MOS XML parser structurally rejects DOCTYPE, ENTITY, PIs, depth > 64, > 1 MiB and __proto__", () => {
  expect(MOS_MAX_XML_DEPTH).toBe(64);
  const unsupported = [
    '<!DOCTYPE mos [<!ENTITY x "boom">]><mos>&x;</mos>',
    '<!ENTITY x "boom"><mos/>',
    '<?xml version="1.0" encoding="UTF-16BE"?><mos/>',
    "<mos><?pi target?></mos>",
    "<!ELEMENT mos ANY><mos/>",
  ];
  for (const xml of unsupported) {
    expect(() => parseMosXml(xml)).toThrow(
      expect.objectContaining({ code: "unsupported" }),
    );
  }

  // Unknown entity reference rejected
  expect(() => parseMosXml("<mos><roID>&custom;</roID></mos>")).toThrow(
    expect.objectContaining({ code: "malformed" }),
  );

  // Prototype pollution attribute rejected
  expect(() => parseMosXml('<mos __proto__="x"/>')).toThrow(
    expect.objectContaining({ code: "malformed" }),
  );
  expect(() => parseMosXml('<mos a="1" a="2"/>')).toThrow(
    expect.objectContaining({ code: "malformed" }),
  );

  // Nesting depth boundary: 64 passes, 65 fails
  const ok64 = "<a>".repeat(64) + "</a>".repeat(64);
  expect(parseMosXml(ok64).name).toBe("a");
  const bad65 = "<a>".repeat(65) + "</a>".repeat(65);
  expect(() => parseMosXml(bad65)).toThrow(
    expect.objectContaining({ code: "malformed" }),
  );

  // Size limit: > 1 MiB UTF-16BE (> 524,288 code units) fails with too_large
  const tooBig = `<mos>${"x".repeat(MOS_MAX_MESSAGE_BYTES / 2)}</mos>`;
  expect(() => parseMosXml(tooBig)).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
});

test("MOS XML parser handles entities, numeric refs, CDATA, comments and round-trips", () => {
  const xml =
    '<mos><!-- comment --><roSlug attr="a &quot;b&quot; &apos;c&apos;">Tom &amp; Jerry &#65; &#x1F441; <![CDATA[raw <tag>]]></roSlug></mos>';
  const tree = parseMosXml(xml);
  expect(tree).toEqual({
    name: "mos",
    attributes: {},
    children: [
      {
        name: "roSlug",
        attributes: { attr: "a \"b\" 'c'" },
        children: ["Tom & Jerry A 👁 raw <tag>"],
      },
    ],
  });
  expect(parseMosXml(writeMosXml(tree))).toEqual(tree);
});

test("all MOS 2.8.5 and Autoscript WinPlus-IP messages build and round-trip over UTF-16BE", () => {
  const env = {
    mosId: "winplus.studio",
    ncsId: "manent.ncs",
    messageId: 7,
  } as const;

  const samples: MosMessage[] = [
    { ...env, kind: "heartbeat", time: "2026-11-25T21:00:00Z" },
    {
      ...env,
      kind: "roCreate",
      roId: "ro-1",
      roSlug: "Six O'Clock News",
      dialect: "mos_2_8_5",
      roEdStart: "2026-11-25T18:00:00Z",
      roEdDur: "00:30:00",
      stories: [
        { storyId: "row-1", storySlug: "1  TOP STORY", storyNum: "1" },
        { storyId: "row-2", storySlug: "2  WEATHER", storyNum: "2" },
      ],
    },
    {
      ...env,
      kind: "roCreate",
      roId: "ro-2",
      roSlug: "Lannick One News",
      dialect: "autoscript_winplus_ip",
      stories: [{ storyId: "row-1", storySlug: "1  OPEN", storyNum: "1" }],
    },
    {
      ...env,
      kind: "roStorySend",
      roId: "ro-1",
      storyId: "row-1",
      storySlug: "1  TOP STORY",
      storyNum: "1",
      dialect: "mos_2_8_5",
      paragraphs: ["ANCHOR", "(to camera)", "Good evening & welcome."],
    },
    {
      ...env,
      kind: "roStorySend",
      roId: "ro-2",
      storyId: "row-1",
      storySlug: "1  OPEN",
      storyNum: "1",
      dialect: "autoscript_winplus_ip",
      presenter: "ANA",
      durationMs: 18_500,
      paragraphs: ["ANA", "Live from studio one."],
    },
    {
      ...env,
      kind: "roElementAction",
      roId: "ro-1",
      operation: "INSERT",
      targetStoryId: "row-2",
      stories: [{ storyId: "row-3", storySlug: "3  SPORT", storyNum: "3" }],
    },
    {
      ...env,
      kind: "roElementAction",
      roId: "ro-1",
      operation: "REPLACE",
      targetStoryId: "row-1",
      stories: [{ storyId: "row-1", storySlug: "1  BREAKING", storyNum: "1" }],
    },
    {
      ...env,
      kind: "roElementAction",
      roId: "ro-1",
      operation: "MOVE",
      targetStoryId: "row-1",
      sourceStoryIds: ["row-3"],
    },
    {
      ...env,
      kind: "roElementAction",
      roId: "ro-1",
      operation: "DELETE",
      sourceStoryIds: ["row-2", "row-3"],
    },
    {
      ...env,
      kind: "roElementAction",
      roId: "ro-1",
      operation: "SWAP",
      sourceStoryIds: ["row-1", "row-2"],
    },
    { ...env, kind: "roDelete", roId: "ro-1" },
    { ...env, kind: "roAck", roId: "ro-1", roStatus: "OK" },
    { ...env, kind: "roReq", roId: "ro-1" },
    { ...env, kind: "roReqAll" },
    {
      ...env,
      kind: "roListAll",
      runningOrders: [
        { roId: "ro-1", roSlug: "Six O'Clock News" },
        { roId: "ro-2", roSlug: "Lannick One News" },
      ],
    },
    { ...env, kind: "roListAll", runningOrders: [] },
  ];

  for (const message of samples) {
    const encoded = encodeMosMessage(message);
    const decoded = decodeMosMessage(encoded);
    expect(decoded).toEqual(message);
  }

  // Verify Autoscript WinPlus-IP emits Autoscript external metadata
  const winPlusCreateXml = writeMosXml(
    buildRoCreate({
      ...env,
      roId: "ro-2",
      roSlug: "Lannick One News",
      dialect: "autoscript_winplus_ip",
      stories: [{ storyId: "row-1", storySlug: "OPEN" }],
    }),
  );
  expect(winPlusCreateXml).toContain("http://www.autoscript.tv/mos");
  expect(winPlusCreateXml).toContain("<storyNum>1</storyNum>");

  const winPlusStoryXml = writeMosXml(
    buildRoStorySend({
      ...env,
      roId: "ro-2",
      storyId: "row-1",
      storySlug: "1  OPEN",
      storyNum: "1",
      dialect: "autoscript_winplus_ip",
      presenter: "ANA",
      durationMs: 12_000,
      paragraphs: ["ANA", "Hello."],
    }),
  );
  expect(winPlusStoryXml).toContain("<mosScope>STORY</mosScope>");
  expect(winPlusStoryXml).toContain("<Presenter>ANA</Presenter>");
  expect(winPlusStoryXml).toContain("<DurationMs>12000</DurationMs>");

  // Direct builder sanity checks for every named builder
  expect(
    parseMosMessage(buildHeartbeat({ ...env, time: "2026-11-25T21:00:00Z" }))
      .kind,
  ).toBe("heartbeat");
  expect(parseMosMessage(buildRoDelete({ ...env, roId: "r" })).kind).toBe(
    "roDelete",
  );
  expect(
    parseMosMessage(buildRoAck({ ...env, roId: "r", roStatus: "OK" })).kind,
  ).toBe("roAck");
  expect(parseMosMessage(buildRoReq({ ...env, roId: "r" })).kind).toBe("roReq");
  expect(
    parseMosMessage(buildRoListAll({ ...env, runningOrders: [] })).kind,
  ).toBe("roListAll");
  expect(
    parseMosMessage(
      buildRoElementAction({
        ...env,
        roId: "r",
        operation: "DELETE",
        sourceStoryIds: ["s1"],
      }),
    ).kind,
  ).toBe("roElementAction");
});

test("UTF-16BE round-trips arbitrary well-formed Unicode strings", () => {
  fc.assert(
    fc.property(fc.string({ unit: "grapheme", maxLength: 64 }), (text) => {
      expect(decodeUtf16Be(encodeUtf16Be(text))).toBe(text);
    }),
    { numRuns: 200 },
  );
});
