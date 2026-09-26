// The worker gets its own global scope, so it needs the polyfill applied there
// too -- 9 of the 20 getOrInsertComputed calls live in the worker bundle. Import
// order is evaluation order, so the compat module runs before pdf.js worker code.
import './pdfjs-compat.mjs';
// Then the console relay, so the page can see what this realm says -- and it must
// be its own module, not a few lines below: an inline statement here would run
// AFTER every import on the list, which is exactly too late to hear the worker boot.
import './pdf.worker.relay.mjs';
import './pdf.worker.min.mjs';
