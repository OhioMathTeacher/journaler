// Page eviction in the PDF reader: what gets drawn, what gets let go, and — the part
// that decides the design — whether the reader's margin notes stay beside their passages.
//
// The app's big block is a CLASSIC script, so its top-level functions are reachable by
// name from here. That is why this driver can call switchToReading() and savePdfBytes()
// directly instead of pantomiming clicks through the load modal.
//
// The invariant under test: a .pdf-page div must never leave the DOM. layoutMarginNotes
// anchors each note to pageEl(page) and parks it at the top as an "orphan" when that div
// is missing, and paintNoteMarks appends the mark straight onto the div — so removing
// pages would strand every note AND erase every mark.
(function(){
  var OUT = [], ERRS = [];
  var RID = 'custom:PROBE|', NPAGES = 30, NNOTES = 12;
  window.addEventListener('error', function(e){ ERRS.push('error: ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function(e){ ERRS.push('reject: ' + (e.reason && e.reason.message || e.reason)); });
  function ok(n, p, d){ OUT.push({ n: n, p: !!p, d: d === undefined ? '' : String(d) }); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  function idbSeed(buf){
    return new Promise(function(res, rej){
      var req = indexedDB.open('journaler_pdfs', 1);
      req.onupgradeneeded = function(){ var db = req.result;
        if(!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs'); };
      req.onsuccess = function(){ var tx = req.result.transaction('pdfs', 'readwrite');
        tx.objectStore('pdfs').put(buf, RID);
        tx.oncomplete = function(){ res(); }; tx.onerror = function(){ rej(tx.error); }; };
      req.onerror = function(){ rej(req.error); };
    });
  }

  async function seedAndReload(){
    await idbSeed(await (await fetch('./_p_probe.pdf')).arrayBuffer());
    // One note every other page, spread the length of the article and far enough apart
    // that the column never has to push a card off its own anchor — so a drift
    // measurement means what it says.
    var notes = [];
    for(var i = 0; i < NNOTES; i++){
      var pg = 1 + i * 2;
      notes.push({ id: i + 1, text: 'A note written about page ' + pg + ', long enough to fill a card.',
        quote: 'A passage on page ' + pg, label: 'p. ' + pg, ts: Date.now(),
        anchor: { page: pg, x: 0.10, y: 0.18, w: 0.72, h: 0.028 } });
    }
    localStorage.setItem('cr_margin_notes_' + RID, JSON.stringify(notes));
    sessionStorage.setItem('probePass', '2');
    location.reload();
  }

  function canvases(){ return [].slice.call(document.querySelectorAll('.pdf-page > canvas')); }
  function canvasMB(){ return canvases().reduce(function(a,c){ return a + c.width*c.height*4; }, 0) / 1048576; }
  function pageDivs(){ return document.querySelectorAll('.pdf-page').length; }
  function noteMarks(){ return document.querySelectorAll('.pdf-page .note-mark').length; }
  function textLayers(){ return document.querySelectorAll('.pdf-page .textLayer').length; }

  // Every note card against the mark it points at. An orphan — the div gone, so the
  // card has nothing to anchor to — is the failure the design exists to prevent.
  function cardDrift(){
    var host = document.getElementById('commentList');
    if(!host) return { worst: -1, orphans: -1, checked: 0 };
    var worst = 0, orphans = 0, checked = 0;
    [].slice.call(host.querySelectorAll('.comment-thread')).forEach(function(card){
      var id = String(card.id || '').replace('comment-', '');
      var mark = document.getElementById('mark-' + id);
      var pg = mark && mark.closest('.pdf-page');
      if(!mark || !pg || !pg.getBoundingClientRect().height){ orphans++; return; }
      checked++;
      var d = Math.abs(card.getBoundingClientRect().top - mark.getBoundingClientRect().top);
      if(d > worst) worst = d;
    });
    return { worst: worst, orphans: orphans, checked: checked };
  }

  function scroller(){
    var c = document.getElementById('textColumn') || document.querySelector('.text-column');
    if(c && c.scrollHeight > c.clientHeight + 4) return c;
    return document.scrollingElement || document.documentElement;
  }

  async function run(){
    if(sessionStorage.getItem('probePass') !== '2'){ await seedAndReload(); return; }
    await sleep(600);
    ok('S1 the app exposes its own functions to drive', typeof switchToReading === 'function');
    if(typeof switchToReading !== 'function') return finish();
    await switchToReading(encodeURIComponent(RID));
    for(var i = 0; i < 120 && pageDivs() < NPAGES; i++) await sleep(250);
    ok('S2 every page of the article has a div from the start', pageDivs() === NPAGES, pageDivs() + ' divs');

    await sleep(1000);
    var first = { c: canvases().length, mb: canvasMB() };
    ok('S3 only a few pages are drawn at rest', first.c > 0 && first.c <= 12, first.c + ' canvases, ' + first.mb.toFixed(1) + ' MB');
    ok('S4 every note is marked on its page, drawn or not', noteMarks() === NNOTES, noteMarks() + ' marks');
    var d0 = cardDrift();
    ok('S5 no note is orphaned at the top', d0.orphans === 0, 'orphans=' + d0.orphans + ' checked=' + d0.checked);
    ok('S6 every note sits on its mark (<=2px)', d0.worst >= 0 && d0.worst <= 2, 'worst drift ' + d0.worst.toFixed(2) + 'px over ' + d0.checked);

    var sc = scroller(), total = sc.scrollHeight - sc.clientHeight;
    ok('S7 the article has its full height from the first paint', total > 8000, 'scrollable ' + Math.round(total) + 'px');
    var peakC = first.c, peakMB = first.mb, worstDrift = d0.worst, orphanEver = d0.orphans,
        divsMin = pageDivs(), marksMin = noteMarks(), STEPS = 24;
    for(var s = 1; s <= STEPS; s++){
      sc.scrollTop = Math.round(total * s / STEPS);
      await sleep(320);
      if(canvases().length > peakC) peakC = canvases().length;
      if(canvasMB() > peakMB) peakMB = canvasMB();
      var d = cardDrift();
      if(d.worst > worstDrift) worstDrift = d.worst;
      if(d.orphans > orphanEver) orphanEver = d.orphans;
      if(pageDivs() < divsMin) divsMin = pageDivs();
      if(noteMarks() < marksMin) marksMin = noteMarks();
    }
    await sleep(500);
    ok('S8 page divs never leave the DOM while scrolling', divsMin === NPAGES, 'fewest seen ' + divsMin);
    ok('S9 note marks never leave the page while scrolling', marksMin === NNOTES, 'fewest seen ' + marksMin);
    ok('S10 no note was ever orphaned', orphanEver === 0, 'worst ' + orphanEver);
    ok('S11 every note stayed on its mark the whole way (<=2px)', worstDrift <= 2, 'worst drift ' + worstDrift.toFixed(2) + 'px');
    ok('S12 canvas memory plateaus rather than climbing', peakC <= 14, 'peak ' + peakC + ' canvases / ' + peakMB.toFixed(1) + ' MB');
    ok('S13 REPORT ONLY — what drawing all ' + NPAGES + ' would cost', true,
       (NPAGES * (peakMB / Math.max(1, peakC))).toFixed(1) + ' MB');
    ok('S14 text layers were released too', textLayers() <= peakC, textLayers() + ' resident');

    sc.scrollTop = 0; await sleep(1500);
    var back = cardDrift();
    ok('S15 pages redraw on the way back up', canvases().length > 0, canvases().length + ' canvases');
    ok('S16 and the notes are still on their marks', back.orphans === 0 && back.worst <= 2, 'orphans=' + back.orphans + ' worst=' + back.worst.toFixed(2) + 'px');
    ok('S17 the text layer rebuilt with them', textLayers() > 0, textLayers() + ' text layers');

    // ── the document lifetime half: a switch must DESTROY the old document, not walk
    // away from it. PDFDocumentProxy keeps its data on the worker side, so dropping the
    // reference frees the handle and none of the memory.
    ok('S18 a document is open to begin with', typeof pdfDoc !== 'undefined' && !!pdfDoc);
    var destroyed = 0;
    // Walk the chain rather than assuming which link owns it — the vendored pdf.js
    // build decides that, and 318P's vendor is not byte-identical to 284's.
    function ownerOf(obj, key){
      for(var o = obj; o; o = Object.getPrototypeOf(o)){
        if(Object.prototype.hasOwnProperty.call(o, key)) return o;
      }
      return null;
    }
    // diagnostic: what does this build actually give us?
    var chain = [], o0 = pdfDoc;
    for(var oo = o0; oo && chain.length < 4; oo = Object.getPrototypeOf(oo)){
      chain.push(((oo.constructor && oo.constructor.name) || '?') + '[' + Object.getOwnPropertyNames(oo).join(' ') + ']');
    }
    ok('S19a REPORT ONLY — the document object', true, chain.join(' → ').slice(0, 900));
    ok('S19b REPORT ONLY — typeof pdfDoc.destroy / .loadingTask', true,
       typeof pdfDoc.destroy + ' / ' + typeof pdfDoc.loadingTask +
       (pdfDoc.loadingTask ? (' (loadingTask.destroy=' + typeof pdfDoc.loadingTask.destroy + ')') : ''));
    // ⚠ IT IS THE LOADING TASK THAT OWNS destroy(). PDFDocumentProxy in pdf.js 6.0.227
    // has cleanup() and loadingTask and no destroy at all, so the obvious d.destroy()
    // throws a TypeError straight into releasePdf's catch and frees nothing, silently.
    // That is precisely what this check exists to catch, so it counts CALLS.
    var task = pdfDoc && pdfDoc.loadingTask;
    var owner = task ? ownerOf(task, 'destroy') : null;
    ok('S19 the teardown call really exists on this pdf.js build',
       !!(owner && typeof owner.destroy === 'function'),
       owner ? ('loadingTask.destroy, on ' + ((owner.constructor && owner.constructor.name) || 'a prototype')) : 'NOT FOUND — releasePdf would free nothing');
    if(owner && typeof owner.destroy === 'function'){
      var orig = owner.destroy;
      owner.destroy = function(){ destroyed++; return orig.apply(this, arguments); };
    }
    ok('S20 releasePdf and clearCustomText are both reachable',
       typeof releasePdf === 'function' && typeof clearCustomText === 'function',
       'releasePdf=' + typeof releasePdf + ' clearCustomText=' + typeof clearCustomText);

    // closing the article
    if(typeof clearCustomText === 'function'){ clearCustomText(); await sleep(600); }
    ok('S21 closing the article destroys its document', destroyed >= 1, destroyed + ' destroy() calls');

    // reopening, then switching away again
    var was = destroyed;
    await switchToReading(encodeURIComponent(RID));
    for(var k = 0; k < 60 && pageDivs() < NPAGES; k++) await sleep(250);
    await sleep(600);
    ok('S22 the article reopens after being closed', pageDivs() === NPAGES && !!pdfDoc, pageDivs() + ' divs');
    if(typeof clearCustomText === 'function'){ clearCustomText(); await sleep(600); }
    ok('S23 and the second document is destroyed too, not leaked', destroyed >= was + 1,
       (destroyed - was) + ' more destroy() calls (total ' + destroyed + ')');

    finish();
  }

  function finish(){
    ok('Z1 no uncaught errors', ERRS.length === 0, ERRS.slice(0,3).join(' | '));
    try { fetch('/_probe_result', { method:'POST', body: JSON.stringify(OUT) }); } catch(e){}
  }
  function go(){ run().catch(function(e){
    OUT.push({ n: 'DRIVER THREW', p: false, d: String(e && e.message || e) });
    try { fetch('/_probe_result', { method:'POST', body: JSON.stringify(OUT) }); } catch(x){}
  }); }
  if(document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
