// The body of every desktop release: what each system shows the first time an unsigned build opens.

export const RELEASE_NOTES = `These builds are unsigned, so your system warns you the first time you open Manent.

macOS: the system says the app "cannot be opened because Apple cannot check it for malicious software". Open System Settings → Privacy & Security and choose Open Anyway.
Windows: the system shows "Windows protected your PC". Choose More info → Run anyway.
Linux: the system shows nothing. Manent needs GTK 3 and the Ayatana app-indicator library installed.

Nothing here is signed: not the app, the installers or the update files. Manent updates itself from these releases, checks each download against the checksum published with it, and installs an update only when you start the app. If an update is interrupted, the version you have keeps working, and Manent tries again the next time it starts. Your scripts are kept outside the app, so an update or a return to an older version does not touch them; an older version opens the copy it made before the update.

The licences of the software Manent includes are in THIRD-PARTY-NOTICES.txt inside the app.`;
