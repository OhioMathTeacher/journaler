// pdf.js 6 calls Map.prototype.getOrInsertComputed, from the 2025 "Map upsert"
// proposal. V8 shipped it; JavaScriptCore has not. So on Safari -- iPad and Mac
// alike -- pdf.js throws before it draws anything and every article is a white
// page. This restores the method where it is missing and stands aside where it
// is not, so the same file is correct in both engines.
function define(proto, name, fn) {
  if (typeof proto[name] === 'function') return;      // engine has it: leave it alone
  Object.defineProperty(proto, name, {
    value: fn, writable: true, configurable: true, enumerable: false
  });
}
function getOrInsertComputed(key, callbackfn) {
  if (typeof callbackfn !== 'function') throw new TypeError('callbackfn must be callable');
  if (this.has(key)) return this.get(key);
  const value = callbackfn(key);                       // computed ONLY on a miss
  this.set(key, value);
  return value;
}
function getOrInsert(key, value) {
  if (this.has(key)) return this.get(key);
  this.set(key, value);
  return value;
}
define(Map.prototype, 'getOrInsertComputed', getOrInsertComputed);
define(Map.prototype, 'getOrInsert', getOrInsert);
define(WeakMap.prototype, 'getOrInsertComputed', getOrInsertComputed);
define(WeakMap.prototype, 'getOrInsert', getOrInsert);

// pdf.js reads text with `for await (const chunk of this.streamTextContent(...))`,
// iterating a ReadableStream directly. Chrome and Firefox implement async iteration
// on ReadableStream; WebKit does not, and has not for years. So on Safari
// getTextContent threw for every page, the text layer stayed empty, and every
// captured box came back "a figure -- no text in that box" while the page itself
// rendered perfectly. The failure was invisible: renderPdf catches it into a
// console.warn no reader can see.
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  const values = function ({ preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const { done, value } = await reader.read();
          if (done) { reader.releaseLock(); return { done: true, value: undefined }; }
          return { done: false, value };
        } catch (err) { reader.releaseLock(); throw err; }
      },
      // Honour early exit -- a `break` out of the loop must not leave the stream
      // locked, or the next getTextContent on the same page deadlocks.
      async return(value) {
        if (preventCancel) { reader.releaseLock(); return { done: true, value }; }
        const cancelled = reader.cancel(value);
        reader.releaseLock();
        await cancelled;
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return this; }
    };
  };
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator,
    { value: values, writable: true, configurable: true });
  Object.defineProperty(ReadableStream.prototype, 'values',
    { value: values, writable: true, configurable: true });
}

// Seven more, found 2026-09-11 on an Android emulator's Chrome 113 while chasing a
// 284 student's tablet, and ported here the same day (the rule above: a compat fix
// in one app goes to the other). pdf.js 6.0.227 calls each of these bare:
//
//   Promise.withResolvers          Chrome 119 / Safari 17.4   everything -- "is not a function"
//   Promise.try                    Chrome 128 / Safari 18.2   EVERY worker message: the handshake
//                                                            fails and pdf.js silently falls back
//                                                            to a main-thread worker
//   URL.parse                      Chrome 126 / Safari 18     every link in a PDF
//   Uint8Array toBase64/fromBase64 Chrome 140 / Safari 18.2   every embedded font
//   Uint8Array.prototype.toHex     same                       the document fingerprint
//   Set.prototype.intersection     Chrome 122 / Safari 17     named destinations
//   Math.sumPrecise                Chrome 141 / no Safari     every TrueType glyph table
//   ArrayBuffer.prototype.transferToFixedLength  Chrome 114 / Safari 17.4  fonts packed for the page
//
// The last two do not throw where anyone can see: the worker stops at the first font,
// the operator list ends at beginText, and the page draws its rules and no words. To
// make the next one visible, import pdf.worker.compat.mjs on the MAIN thread before
// getDocument -- pdf.js then runs the worker in-page and the TypeErrors land in the
// console. Each polyfill below is shaped for the calls pdf.js makes, not the whole
// proposal, and stands aside where the engine has the real thing.
define(Promise, 'withResolvers', function withResolvers() {
  let resolve, reject;
  const promise = new this((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
});
define(Promise, 'try', function tryFn(fn, ...args) {
  return new this(resolve => resolve(fn(...args)));       // a sync throw becomes a rejection
});
define(URL, 'parse', function parse(url, base) {
  try { return base === undefined ? new URL(url) : new URL(url, base); } catch { return null; }
});
define(Set.prototype, 'intersection', function intersection(other) {
  const out = new Set();
  for (const v of this) if (other.has(v)) out.add(v);
  return out;
});
define(Uint8Array.prototype, 'toBase64', function toBase64(opts) {
  let s = '';
  for (let i = 0; i < this.length; i += 0x8000)            // chunked: apply() has an argument limit
    s += String.fromCharCode.apply(null, this.subarray(i, i + 0x8000));
  let b64 = btoa(s);
  if (opts && opts.alphabet === 'base64url') b64 = b64.replace(/\+/g, '-').replace(/\//g, '_');
  if (opts && opts.omitPadding) b64 = b64.replace(/=+$/, '');
  return b64;
});
define(Uint8Array, 'fromBase64', function fromBase64(str, opts) {
  let s = String(str).replace(/\s+/g, '');
  if (opts && opts.alphabet === 'base64url') s = s.replace(/-/g, '+').replace(/_/g, '/');
  if (s.length % 4) s += '='.repeat(4 - (s.length % 4));
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
});
define(Uint8Array.prototype, 'toHex', function toHex() {
  let s = '';
  for (let i = 0; i < this.length; i++) s += (this[i] < 16 ? '0' : '') + this[i].toString(16);
  return s;
});
define(Math, 'sumPrecise', function sumPrecise(iterable) {
  // Neumaier's compensated sum: exact enough for the sizes and offsets pdf.js adds.
  let sum = 0, c = 0;
  for (const x of iterable) {
    const t = sum + x;
    c += Math.abs(sum) >= Math.abs(x) ? (sum - t) + x : (x - t) + sum;
    sum = t;
  }
  return sum + c;
});
define(ArrayBuffer.prototype, 'transferToFixedLength', function transferToFixedLength(newLength) {
  // A copy, not a transfer: the engine cannot detach the source. pdf.js only reads the result.
  const n = newLength === undefined ? this.byteLength : newLength;
  const out = new ArrayBuffer(n);
  new Uint8Array(out).set(new Uint8Array(this, 0, Math.min(n, this.byteLength)));
  return out;
});
