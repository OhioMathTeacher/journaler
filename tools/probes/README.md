# Probes — driving the real app to see what it actually does

```
python3 tools/probes/run.py     # page eviction, note anchoring, canvas memory, ~1 minute
```

Needs `python3` and a `chromium`/`chrome` on `PATH`. Nothing else. Exit code is the number
of failed checks, so it works as a gate. Ported from `journaler-284`, which carries the
same harness and a second suite.

The probe page **is `index.html`** with one `<script>` tag added — nothing is stubbed. The
app's big block is a **classic** script, so its top-level functions are on the global
object and the driver calls `switchToReading()` and friends by name instead of pantomiming
clicks. Generated files (`_p_pages.html`, `_p_probe.pdf`) are gitignored and deleted when
the run ends.

## ⚠ Two traps this harness was built by falling into

**Never `--virtual-time-budget`.** It runs Chrome on a fake clock, advancing whenever the
main thread looks idle — which is exactly what it looks like while a pdf.js worker parses.
The document never finishes loading, every assertion runs against `Loading…`, and **nothing
reports an error** because nothing failed; the harness just stopped waiting. Real clock
only; results come back by `POST` instead of `--dump-dom`.

**Inject before the LAST `</body>`.** The first one in this file is inside a JavaScript
template literal — `printProblemReport` builds a whole HTML document in a string — so
injecting there lands the driver tag mid-literal and kills the app with `Unexpected end of
input` a thousand lines from anything real.

## What the suite pins down

Builds a 30-page article (`make-pdf.py`, hand-rolled so there are no dependencies), puts 12
margin notes down it, scrolls end to end in 24 steps and back, then closes and reopens it.

**The constraint.** `layoutMarginNotes` anchors each note to `pageEl(page)` and parks it at
the top as an *orphan* when that div is missing, and `paintNoteMarks` appends the mark
straight onto the div. Removing page divs to save memory would strand every note **and**
erase every mark — so it asserts every `.pdf-page` div is present at all times, no note is
ever orphaned, and every note stays within 2px of its mark the whole way.

**The memory.** Canvases must plateau rather than climb, and be released with their text
layers, then redraw on the way back up.

**The teardown, and this is the one that earned its keep.** `PDFDocumentProxy` in pdf.js
6.0.227 has `cleanup()` and `loadingTask` and **no `destroy()` at all** — so the obvious
`doc.destroy()` throws a TypeError straight into `releasePdf`'s catch and frees nothing,
silently. Both this app and journaler-284 shipped exactly that and reported success. The
suite therefore **counts destroy() calls** rather than reading the code, and asserts the
teardown call still exists on whatever pdf.js is vendored.

### Known limits

Chromium only, at whatever `devicePixelRatio` the headless window reports (1 by default, so
the memory numbers are a **ratio**, not what a retina screen at `dpr 2` will show). The
probe article is born-digital with 30 uniform pages — not a real scan, no mixed page sizes.
