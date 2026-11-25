// Side-effect import that installs globalThis.pdfjsWorker so pdf.js runs on the main thread without workerSrc.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {}
