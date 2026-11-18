// Checks of the machine made before anything is installed, so this file imports node: modules only.
import type { NetworkInterfaceInfo } from "node:os";

const MINIMUM_BUN = "1.4.4";

/** Name prefixes of virtual interfaces (bridges, tunnels, containers, virtual machines), whose addresses another machine cannot reach. */
const VIRTUAL_INTERFACES = [
  "bridge",
  "utun",
  "tun",
  "tap",
  "docker",
  "br-",
  "veth",
  "vEthernet",
  "vmnet",
  "vboxnet",
] as const;

/** The command that installs Bun on `platform`. */
export function installCommand(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? 'powershell -c "irm bun.com/install.ps1 | iex"'
    : "curl -fsSL https://bun.com/install | bash";
}

/** The message is a terminal sentence naming the version found and the install command. */
export function checkBunVersion(
  found: string,
  platform: NodeJS.Platform = process.platform,
): { ok: true } | { ok: false; message: string } {
  if (Bun.semver.satisfies(found, `>=${MINIMUM_BUN}`)) return { ok: true };
  return {
    ok: false,
    message: `Manent needs Bun ${MINIMUM_BUN} or later (found ${found}). Install it with: ${installCommand(platform)}`,
  };
}

/** 10/8, 172.16/12 and 192.168/16. */
function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
  )
    return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168)
  );
}

/** The first private IPv4 address of a network card that is neither internal nor virtual; null when there is none. */
export function pickLanAddress(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string | null {
  for (const [name, infos] of Object.entries(interfaces)) {
    if (VIRTUAL_INTERFACES.some((prefix) => name.startsWith(prefix))) continue;
    const card = infos?.find(
      (info) =>
        info.family === "IPv4" && !info.internal && isPrivateIpv4(info.address),
    );
    if (card !== undefined) return card.address;
  }
  return null;
}
