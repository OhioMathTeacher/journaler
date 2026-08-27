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
