// The worker gets its own global scope, so it needs the polyfill applied there
// too -- 9 of the 20 getOrInsertComputed calls live in the worker bundle. Import
// order is evaluation order, so the compat module runs before pdf.js worker code.
import './pdfjs-compat.mjs';
import './pdf.worker.min.mjs';
