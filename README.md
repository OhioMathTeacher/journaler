# Journaler

A reflective-writing studio: write dated entries, **revisit the same topic over time and watch your thinking evolve**, think it through with two AI partners, then **read your own corpus closely** and reflect on it. Local-first, no backend, no account — your work stays in your browser, and you export **one PDF** to submit.

Sibling to **[Marginalia](https://github.com/OhioMathTeacher/marginalia)** — shares its believing/doubting AI partners and its local-first, browser-only philosophy — but **journal-first**: no reader/viewer, no document import. You read your source (article, prompt, problem, experience) wherever your class already puts it; you *write* here.

_Standalone + reusable across courses. This repo is the app; each class documents its own use-case (see "Use cases"). Draft spec 2026-07-11._

---

## The core idea
A normal journal (or an LMS dropbox) collects **isolated entries**. Journaler treats a writer's thinking as a **living thread they can watch evolve** — and then, at the end, hands the whole corpus back to them as a text to read closely. *Most tools collect reflections; this one lets a writer watch a reflection change its mind.*

## Features
1. **Dated entries, threaded by topic.** Each entry is dated and attached to a topic (an article, a prompt, a problem, a week). Revisit a topic and your new entry chains under it — the progression is visible.
2. **Two AI partners on your own writing** (after Peter Elbow's believing/doubting game): **Elbow** strengthens an entry (what's the best version of this?), **Socrates** presses it (what doesn't hold up?). The distinctive move — **Believe / Doubt / Synthesize**: hear both, then write your synthesis.
3. **Theme tags (secondary).** Tag a throughline (a recurring idea) and watch it develop across different topics and dates.
4. **Bundled review / synthesis mode — the capstone.** All entries in a viewer, **organized by topic → then by date**. Below the viewer, a **required meta-reflection** prompt (or a few) that turns the writer's own corpus into the text they now reflect on.
5. **Single-PDF export.** The bundled corpus **+ the required meta-reflection** print as **one PDF** — the submission artifact. (Also solves persistence: the graded thing lives wherever they submit it, not only in browser storage.)

### Default meta-reflection prompts (terse, non-leading; instructor-configurable; show a few / rotate)
- **Audience & voice:** *Who were you writing for? Why does that matter?* · *Where do you sound like a teacher? Where do you still sound like a student?*
- **Growth:** *Your first entry and your last — what changed?* · *What did you keep circling back to without meaning to?*
- **Theme:** *What runs through all of these that you never planned?* · *When you write about ___, what are you really writing about?*
- **Stance / empathy:** *Where were you thinking about someone else? Where only about yourself?* · *When did a reading change your mind — and when did you defend what you already believed?*
- **Honesty:** *Where were you performing, and where were you thinking?*

## Design principles
- **Local-first, no backend.** Browser localStorage; the export is how work leaves the machine. (Reuse Marginalia's storage + AI-partner + PDF machinery where sensible.)
- **Reflection quality over polish.** The app is a thinking space, not a grading engine.
- **Configurable, not course-coupled.** Prompt sets, what a "topic" means, and how many entries are expected are class-level config — the app ships generic.

## Use cases
- **TCE 318P — Act I Reading Journal (Miami, Fall 2026).** 5 weekly entries (one per math-ed article) + the required capstone meta-reflection → the single PDF is the submission (50 pts). Articles are read via the library link on Canvas; Journaler is the writing + revisiting + capstone surface.
- **[Todd's other course — TBD].** Same app, different topics/prompts/cadence.

## Tech (intended)
- Single self-contained HTML app (Marginalia pattern: `close-reader.html` → here, a journal-only build), optional small `vendor/` (PDF export). Serve statically; also Tauri-packageable later like Marginalia.

## Open questions
- **Name** (see below).
- **Grading model** each class chooses: does the capstone earn its own points, gate submission, or add points?
- **Synthesis mode trigger:** end-of-term only, or available any time so the corpus visibly grows?
- **Per-period tagging** so entries map cleanly to weeks/units.
- Whether the AI-press on the capstone is offered or required.

## Naming
**Journaler** — decided 7/11 (plain and clear, a virtue for a wide student audience). Alternatives considered and set aside: *Palimpsest* (evocative, pairs with Marginalia, but costs spellability), *Throughline*.
