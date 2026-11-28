// The inline script at the top of the page: it replays the boot cache onto the root before anything is drawn.
import { BOOT_KEY } from "./boot-cache.ts";

// it knows no setting: it replays ["a", name, value] writes from sessionStorage or localStorage fallback, and marks desktop chrome before first paint
export const BOOT_SCRIPT = `try{const d=document.documentElement,p=window.manentDesktop?.platform;if(p==="mac"||p==="windows")d.setAttribute("data-desktop-chrome",p);const k=${JSON.stringify(BOOT_KEY)};let r=null;try{r=sessionStorage.getItem(k)}catch{}if(r===null)try{r=localStorage.getItem(k)}catch{}for(const[t,n,v]of JSON.parse(r??"[]"))if(t==="a")v===null?d.removeAttribute(n):d.setAttribute(n,v)}catch{}`;

/** The script's hash as a content security policy names it: "sha256-<base64>". Runs at build time, under Bun. */
export function bootScriptHash(): string {
  const digest = new Bun.CryptoHasher("sha256")
    .update(BOOT_SCRIPT)
    .digest("base64");
  return `sha256-${digest}`;
}
