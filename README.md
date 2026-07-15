# GridReady UK

A self-contained, chapter-based technical book for a UK electrical engineer studying power-system analysis, protection coordination, grid connection and DIgSILENT PowerFactory. The 32 chapters can still be followed at a one-chapter-per-week pace.

## Open it

The simplest option is to double-click `index.html`. The course, glossary, tutor, quizzes, progress, bookmarks and CPD log work directly from local files. No build and no paid API are required.

For an HTTP preview (closer to Vercel), run:

```powershell
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## What is included

- A Foundation Zero prologue, 32 sequenced chapters and 6 book parts
- Teacher layer in every chapter: readiness check, mental model, misconceptions, workplace target and independent mastery practice
- A mastery reading pack in every chapter with at least 8 definitions, symbol/unit/assumption/trap notes, formula or decision-method cards, and a complete worked example with professional interpretation
- 88 formula/method cards and 32 complete worked examples covering fundamentals through connection/compliance engineering
- 64 concept sections, 32 PowerFactory runbooks, 128 fully guided major steps and 64 retrieval questions
- Every major lab step follows prepare, perform, verify, troubleshoot and record; every chapter also has a PowerFactory pre-flight sheet naming the case, objects/data, command, outputs and numerical hold point
- Visual seven-stage chapter maps, progressive definitions, equation-use ladders, worked-example fading, focus reading and previous/next chapter navigation
- Foundation Zero teaches algebra, trigonometry, complex numbers, phasors/RMS, KCL/KVL, R/L/C, star/delta and basic dynamic-state calculus before the PowerFactory bootcamp and 16-step Mini-3B build
- Six local engineering practice tools: three-phase power/current, per-unit, Thevenin fault, voltage drop/rise, IEC IDMT and G98/G99 route screening
- 154-term linked technical glossary with automatic first-use hover, keyboard-focus and tap popovers
- Six written evidence records plus two retrieval questions per chapter; completion is gated until all six substantive local records and both quiz answers are complete
- Multi-turn local tutor that retrieves the whole course, indexes aliases, remembers topic/history/depth, completes missing-input calculations on the next turn, supports comparisons/formulas/PowerFactory follow-ups, links official sources and refuses low-confidence answers
- Runnable PowerFactory Python and validity-gated test-evaluator patterns in Chapters 30–31
- Search across lessons, glossary and official sources
- Local progress, bookmarks, quiz attempts, theme and CPD evidence
- CPD CSV export with spreadsheet-formula neutralisation
- 42-source official UK/GB and DIgSILENT register checked 15 July 2026

All learner data—including tutor history—stays in browser `localStorage`. The tutor uses that history to keep the current topic and pending calculation context; it does not train a model on the conversation. Clearing site data or using **Clear** removes it. The tutor makes no API or network call and does not transmit questions anywhere.

## Vercel/static hosting

This is a dependency-free static site. Import this folder into any static host or run `vercel` from the folder if you already use the Vercel CLI. No serverless function or environment variable is needed.

## Validation

With Node.js available:

```powershell
node --check data.js
node --check teacher-data.js
node --check mastery-data.js
node --check app.js
node tests/validate.mjs
node tests/tutor.mjs
node tests/book.mjs
```

## Engineering boundary

The course is original educational material and aims to be self-contained for learning. It is not an operational instruction or substitute for a current licensed standard, signed connection agreement, host DNO/TO policy, relay manual, manufacturer-validated model, installed PowerFactory manual/Technical References or competent engineering review. Grid Code, ENA recommendations and connection processes change; the website deliberately links to live official registers and shows its last verification date.
