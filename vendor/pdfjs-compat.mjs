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
