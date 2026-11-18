// The inline script at the top of the page: it replays the boot cache onto the root before anything is drawn.
import { BOOT_KEY } from "./boot-cache.ts";

// it knows no setting: it replays ["a", name, value] writes, and a cache it cannot read changes nothing
export const BOOT_SCRIPT = `try{const w=JSON.parse(sessionStorage.getItem(${JSON.stringify(BOOT_KEY)})??"[]"),d=document.documentElement;for(const[k,n,v]of w)if(k==="a")v===null?d.removeAttribute(n):d.setAttribute(n,v)}catch{}`;

/** The script's hash as a content security policy names it: "sha256-<base64>". Runs at build time, under Bun. */
export function bootScriptHash(): string {
  const digest = new Bun.CryptoHasher("sha256")
    .update(BOOT_SCRIPT)
    .digest("base64");
  return `sha256-${digest}`;
}
