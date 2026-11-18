import { expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "node:os";
import {
  checkBunVersion,
  installCommand,
  pickLanAddress,
} from "../demo/preflight.ts";

const nic = (address: string, internal = false) => [
  { address, family: "IPv4", internal },
];

test("Bun 1.4.4 or later is required, and the message says how to get it", () => {
  expect(checkBunVersion("1.4.4")).toEqual({ ok: true });
  expect(checkBunVersion("1.5.0")).toEqual({ ok: true });
  expect(checkBunVersion("1.4.3", "darwin")).toEqual({
    ok: false,
    message:
      "Manent needs Bun 1.4.4 or later (found 1.4.3). Install it with: curl -fsSL https://bun.com/install | bash",
  });
  expect(installCommand("win32")).toBe(
    'powershell -c "irm bun.com/install.ps1 | iex"',
  );
  expect(
    (checkBunVersion("1.3.14", "win32") as { message: string }).message,
  ).toContain("irm bun.com/install.ps1");
});

test("the LAN address is the first private IPv4 address of a real network card", () => {
  const en0: NetworkInterfaceInfo[] = [
    {
      address: "203.0.113.5",
      netmask: "255.255.255.0",
      family: "IPv4",
      mac: "00:00:00:00:00:01",
      internal: false,
      cidr: "203.0.113.5/24",
    },
    {
      address: "fd00::5",
      netmask: "ffff:ffff:ffff:ffff::",
      family: "IPv6",
      mac: "00:00:00:00:00:01",
      internal: false,
      cidr: "fd00::5/64",
      scopeid: 0,
    },
    {
      address: "192.168.1.20",
      netmask: "255.255.255.0",
      family: "IPv4",
      mac: "00:00:00:00:00:01",
      internal: false,
      cidr: "192.168.1.20/24",
    },
  ];
  const lo0: NetworkInterfaceInfo[] = [
    {
      address: "127.0.0.1",
      netmask: "255.0.0.0",
      family: "IPv4",
      mac: "00:00:00:00:00:00",
      internal: true,
      cidr: "127.0.0.1/8",
    },
  ];
  expect(pickLanAddress({ en0, lo0 })).toBe("192.168.1.20");
  expect(pickLanAddress({ en0: en0.slice(0, 2), lo0 })).toBeNull();
  expect(pickLanAddress({ lo0: nic("10.0.0.1", true) } as never)).toBeNull();
  const ranges = [
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.0.1",
    "172.15.0.1",
    "172.32.0.1",
    "192.169.0.1",
    "11.0.0.1",
  ];
  expect(
    ranges.map((address) => pickLanAddress({ en0: nic(address) } as never)),
  ).toEqual([
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.0.1",
    null,
    null,
    null,
    null,
  ]);
});

test("bridge, utun, docker and vEthernet interfaces are skipped", () => {
  expect(
    pickLanAddress({
      bridge100: nic("192.168.64.1"),
      utun4: nic("10.8.0.2"),
      docker0: nic("172.17.0.1"),
      "vEthernet (WSL)": nic("172.28.0.1"),
      "br-1a2b": nic("172.18.0.1"),
      en0: nic("192.168.1.20"),
    } as never),
  ).toBe("192.168.1.20");
  const skipped = ["tun0", "tap0", "veth12", "vmnet8", "vboxnet0"];
  expect(
    skipped.map((name) => pickLanAddress({ [name]: nic("10.1.2.3") } as never)),
  ).toEqual([null, null, null, null, null]);
});
