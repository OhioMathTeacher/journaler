// Restoring a backup, and knowing whether one was ever taken.
//
// The two properties under test are the ones whose failure is SILENT:
//
//   1. Adding must combine, not overwrite. In journaler-284 two real archives held 23
//      and 100 marked passages with ZERO overlap and the app could only ever produce
//      one or the other. Nothing errored; a student simply lost a device's work.
//   2. A backup must be recorded ONLY when the file actually reached the reader.
//      Marking work safe after a failed or cancelled save is the one bug that makes
//      the reminder worse than not having it — it goes quiet at exactly the wrong time.
//
// Both are asserted by OUTCOME (what is in storage afterwards), never by checking that
// some function was called.
(function(){
  var OUT = [], ERRS = [];
  window.addEventListener('error', function(e){ ERRS.push('error: ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function(e){ ERRS.push('reject: ' + (e.reason && e.reason.message || e.reason)); });
  function ok(n, p, d){ OUT.push({ n: n, p: !!p, d: d === undefined ? '' : String(d) }); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  var NK = 'cr_margin_notes_custom:PROBE|';
  var JK = 'cr_journal';

  function wipe(){
    var kill = [];
    for (var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if (k && (k.indexOf('cr_margin_notes_') === 0 || k === JK || k === 'cr_last_backup' || k === 'cr_last_visit')) kill.push(k);
    }
    kill.forEach(function(k){ localStorage.removeItem(k); });
  }
  function notes(prefix, n, from){
    var a = [];
    for (var i = 0; i < n; i++) a.push({ id: prefix + i, passage: 'p' + i, comment: 'c' + i, anchor: {}, ts: (from || 0) + i });
    return a;
  }
  function entry(id, rid, edited){
    return { id: id, ts: edited, edited: edited, kind: 'chat', readingId: rid, readingTitle: rid, messages: [], take: id };
  }
  function count(k){ var a = null; try { a = JSON.parse(localStorage.getItem(k)); } catch(e){} return Array.isArray(a) ? a.length : -1; }

  async function run(){
    ok('B0 the new functions are reachable',
       typeof applyImport === 'function' && typeof mergeById === 'function' &&
       typeof recordBackup === 'function' && typeof workSinceBackup === 'function',
       'applyImport/mergeById/recordBackup/workSinceBackup');

    // ── 1. the 284 case: two disjoint archives ────────────────────────────
    wipe();
    localStorage.setItem(NK, JSON.stringify(notes('mine', 23)));
    var t1 = applyImport({ [NK]: JSON.stringify(notes('theirs', 100)) }, 'add');
    ok('B1 two archives with no overlap COMBINE (284 lost this: 23 + 100)',
       count(NK) === 123, 'here now ' + count(NK) + ', expected 123');
    // The receipt shown to the reader must match what storage actually holds --
    // a summary that overstates is how someone stops taking backups seriously.
    ok('B1a the reported count is the count that landed',
       t1 && t1.notesAdded === 100 && t1.notesKept === 0,
       'reported added=' + (t1||{}).notesAdded + ' kept=' + (t1||{}).notesKept);

    // ── 2. adding the same file twice must not duplicate ──────────────────
    var t2 = applyImport({ [NK]: JSON.stringify(notes('theirs', 100)) }, 'add');
    ok('B2a re-adding reports nothing added and 100 already here',
       t2 && t2.notesAdded === 0 && t2.notesKept === 100,
       'reported added=' + (t2||{}).notesAdded + ' kept=' + (t2||{}).notesKept);
    ok('B2 re-adding the same file changes nothing (identity is the id, not a guess)',
       count(NK) === 123, 'still ' + count(NK));

    // ── 3. replace still replaces, wholesale ──────────────────────────────
    applyImport({ [NK]: JSON.stringify(notes('only', 5)) }, 'replace');
    ok('B3 "Replace everything" still means everything',
       count(NK) === 5, 'here now ' + count(NK) + ', expected 5');

    // ── 4. the journal SLOT collision ─────────────────────────────────────
    // The app keeps ONE chat entry per reading and finds it with
    // find(x => x.readingId === rid && x.kind === 'chat'). Two devices hold different
    // ids in the same slot; appending both leaves the second permanently unreachable.
    wipe();
    localStorage.setItem(JK, JSON.stringify([entry('mine', 'r1', 1000)]));
    applyImport({ [JK]: JSON.stringify([entry('theirs', 'r1', 2000)]) }, 'add');
    var j = JSON.parse(localStorage.getItem(JK));
    var slot = j.filter(function(e){ return e.readingId === 'r1' && e.kind === 'chat'; });
    ok('B4 two entries for ONE reading do not stack an unreachable second',
       slot.length === 1, slot.length + ' entries in the r1 chat slot');
    ok('B4a the more recently edited one wins',
       slot.length === 1 && slot[0].id === 'theirs', slot.length ? slot[0].id : 'none');

    // and the reverse: an older file must not clobber newer local work
    wipe();
    localStorage.setItem(JK, JSON.stringify([entry('mine', 'r1', 5000)]));
    applyImport({ [JK]: JSON.stringify([entry('theirs', 'r1', 2000)]) }, 'add');
    j = JSON.parse(localStorage.getItem(JK));
    ok('B4b an OLDER file does not overwrite newer work here',
       j.length === 1 && j[0].id === 'mine', j.length + ' entries, kept "' + (j[0]||{}).id + '"');

    // entries for DIFFERENT readings are additive, not a collision
    applyImport({ [JK]: JSON.stringify([entry('other', 'r2', 3000)]) }, 'add');
    ok('B4c different readings still combine',
       count(JK) === 2, count(JK) + ' entries');

    // ── 5. a scalar setting is not clobbered by "add" ─────────────────────
    localStorage.setItem('cr_probe_setting', 'mine');
    applyImport({ 'cr_probe_setting': 'theirs' }, 'add');
    ok('B5 "add" keeps a setting this browser already has',
       localStorage.getItem('cr_probe_setting') === 'mine', localStorage.getItem('cr_probe_setting'));
    localStorage.removeItem('cr_probe_setting');

    // ── 6. a backup is recorded ONLY on a save that reached the reader ────
    wipe();
    localStorage.setItem(NK, JSON.stringify(notes('mine', 12)));
    var realSave = window.saveBlob;

    window.saveBlob = function(){ return Promise.resolve(false); };   // cancelled share sheet
    workDirty = true;
    exportAll(); await sleep(120);
    ok('B6 a CANCELLED save records no backup',
       localStorage.getItem('cr_last_backup') === null, JSON.stringify(localStorage.getItem('cr_last_backup')));
    ok('B6a and the work is still marked unsaved',
       workDirty === true, 'workDirty=' + workDirty);

    window.saveBlob = function(){ return Promise.reject(new Error('disk full')); };
    exportAll(); await sleep(120);
    ok('B6b a FAILED save records no backup either',
       localStorage.getItem('cr_last_backup') === null, JSON.stringify(localStorage.getItem('cr_last_backup')));

    window.saveBlob = function(){ return Promise.resolve(true); };    // reached the reader
    exportAll(); await sleep(120);
    var b = null; try { b = JSON.parse(localStorage.getItem('cr_last_backup')); } catch(e){}
    ok('B7 a SUCCESSFUL save records one, with the counts it covered',
       !!b && b.counts && b.counts.notes === 12, b ? JSON.stringify(b.counts) : 'nothing recorded');
    ok('B7a and the work is no longer marked unsaved', workDirty === false, 'workDirty=' + workDirty);
    ok('B7b nothing is outstanding immediately after a backup',
       workSinceBackup().notes === 0 && workSinceBackup().entries === 0, JSON.stringify(workSinceBackup()));

    // ── 7. the reminder fires on work made SINCE, and carries its own button ──
    hideBackupNag();
    localStorage.setItem(NK, JSON.stringify(notes('mine', 12 + NAG_NOTES)));
    ok('B8 outstanding work is measured against the last backup, not the total',
       workSinceBackup().notes === NAG_NOTES, JSON.stringify(workSinceBackup()));
    checkBackupNag();
    var nag = document.getElementById('backupNag');
    ok('B9 the reminder appears once the threshold is crossed',
       !!nag && nag.classList.contains('open'), nag ? nag.className : 'no element');
    ok('B9a and it carries the save button itself, not a menu path',
       !!nag && /exportAll\(\)/.test(nag.innerHTML), nag ? (nag.querySelector('.nag-go')||{}).textContent : '');

    // below threshold, and after a backup, it stays quiet
    hideBackupNag(); _nagDismissed = false;
    localStorage.setItem(NK, JSON.stringify(notes('mine', 12 + NAG_NOTES - 1)));
    var jj = JSON.parse(localStorage.getItem(JK) || '[]');
    localStorage.setItem(JK, JSON.stringify(jj.slice(0, (JSON.parse(localStorage.getItem('cr_last_backup')).counts.entries))));
    checkBackupNag();
    nag = document.getElementById('backupNag');
    ok('B10 it stays quiet below the threshold (a reminder that always fires is wallpaper)',
       !nag || !nag.classList.contains('open'),
       'since=' + JSON.stringify(workSinceBackup()));

    window.saveBlob = realSave;

    // ── 8. the desktop path is the anchor, and it is not revoked immediately ──
    ok('B11 this browser is not treated as iOS (share sheet is iOS-only)',
       IS_IOS === false, 'IS_IOS=' + IS_IOS);
    var got = await saveBlob(new Blob(['x'], { type: 'text/plain' }), 'probe.txt');
    ok('B12 saveBlob resolves true on the desktop anchor path', got === true, 'resolved ' + got);

    wipe();
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
