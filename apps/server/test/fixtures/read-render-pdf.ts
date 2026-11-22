// Reads the script font as a bundled server does at start; exits non-zero when a face cannot be opened.
import { readServerRenderPdf } from "../../src/production.ts";

await readServerRenderPdf();
