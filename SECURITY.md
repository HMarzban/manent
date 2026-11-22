# Security policy

## Report a vulnerability

Please report a vulnerability privately, through GitHub, not in a public issue:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**, or open https://github.com/HMarzban/manent/security/advisories/new directly.
3. Describe the problem, how to reproduce it, and what an attacker could do with it.

The report is visible only to you and the maintainers. You will get an answer in the advisory, and the fix and its credit are agreed there before anything is made public.

## What is supported

Manent has made no release. Only the `main` branch is supported, and a fix lands there.

## What the demo is, and is not

Manent today runs as a local demo. Some of its behaviour is by design and is not a vulnerability:

- **Sign-in has no passwords.** Anyone who can reach the demo can choose any demo person. For that reason the server listens only on loopback, and with `LAN=1` on one private-range address as well; it refuses a public or wildcard address. Do not expose the demo to a network you do not trust.
- **Sessions do not expire** in the demo.

Please do report a way around those limits: a way to make the demo listen on a public address, to reach it from another site through the browser, to use a socket ticket twice, to write to a script without the rights to it, or to read or write files outside the demo's data folder.
