// The worker's console, mirrored to the page that can keep it.
//
// Every compat bug so far announced itself here and nowhere else. pdf.js catches a
// missing API into warn(), the operator list stops at the first font, and the page
// draws its figures and no words -- which is what a student reports as "it won't
// load the text in, I can only see the photos". The one sentence naming the cause
// went to a worker console no student can open, and the diagnostics panel's own
// header called this out as its known gap: a Worker is its own realm.
//
// So post each line to the main thread, where appLog stores it and ⚙ → Diagnostics
// hands it back. The envelope carries NO targetName, and pdf.js's MessageHandler
// returns early on any message whose targetName is not its own -- so pdf.js never
// sees these, and the page listens for them without owning the worker.
//
// This is a diagnostic: every path is wrapped so it can never be the reason the
// worker fails. A relay that breaks the thing it watches is worse than no relay.

if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined'
    && self instanceof WorkerGlobalScope) {
  (function () {
    var MSG_MAX = 300, DATA_MAX = 600;

    function one(a) {
      try {
        if (a instanceof Error) return (a.name || 'Error') + ': ' + a.message;
        if (a && typeof a === 'object') return JSON.stringify(a).slice(0, 200);
        return String(a);
      } catch (e) { return '[unprintable]'; }
    }
    function fmt(args) {
      var out = [];
      for (var i = 0; i < args.length; i++) out.push(one(args[i]));
      return out.join(' ');
    }
    function stackOf(args) {
      for (var i = 0; i < args.length; i++)
        if (args[i] instanceof Error && args[i].stack) return args[i].stack;
      return undefined;
    }
    function post(level, message, data) {
      try {
        self.postMessage({ __appLog: {
          level: level, source: 'pdf.worker',
          message: String(message).slice(0, MSG_MAX),
          data: data === undefined ? undefined : String(data).slice(0, DATA_MAX)
        } });
      } catch (e) {}
    }

    var orig = { warn: console.warn, error: console.error };
    console.warn = function () {
      try { post('warn', fmt(arguments), stackOf(arguments)); } catch (e) {}
      return orig.warn.apply(console, arguments);
    };
    console.error = function () {
      try { post('error', fmt(arguments), stackOf(arguments)); } catch (e) {}
      return orig.error.apply(console, arguments);
    };

    // A TypeError from a missing API does not always reach console: pdf.js lets some
    // of them reject a promise instead, and the page only sees a page that never drew.
    self.addEventListener('error', function (ev) {
      try {
        post('error', (ev && ev.message) || 'worker error',
             ev && ev.error instanceof Error ? ev.error.stack
               : (ev && ev.filename ? ev.filename + ':' + ev.lineno : undefined));
      } catch (e) {}
    });
    self.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev && ev.reason;
        post('error', 'unfinished: ' + one(r), r instanceof Error ? r.stack : undefined);
      } catch (e) {}
    });

    // Say the realm is reachable, so a report that carries no worker line at all
    // distinguishes "the worker was fine" from "the relay never ran".
    post('info', 'worker console relay attached');
  })();
}
