# GridReady UK

A self-contained, chapter-based technical book for an electrical engineer working in Great Britain and studying power-system analysis, protection coordination, grid connection and DIgSILENT PowerFactory. The 32 chapters can still be followed at a one-chapter-per-week pace.

## Open it

The simplest option is to double-click `index.html`. The course, glossary, tutor, quizzes, progress, bookmarks and CPD log work directly from local files. No build and no paid API are required.

For an HTTP preview (closer to Vercel), run:

```powershell
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## What is included

- A Foundation Zero prologue, 32 sequenced chapters and 6 book parts
- A book-first chapter pattern: engineering question, annotated figure, physical story, definitions and equations, worked example, PowerFactory field procedure, interpretation and workplace quick card
- A mastery reading pack in every chapter with at least 8 definitions, symbol/unit/assumption/trap notes, formula or decision-method cards, and a complete worked example with professional interpretation
- 88 formula/method cards and 32 complete worked examples covering fundamentals through connection/compliance engineering
- 64 concept sections, 32 PowerFactory runbooks, 178 guided steps and 64 retrieval questions
- Detailed 12–16-step field procedures for AC load flow, IEC 60909, overcurrent coordination, RMS dynamics and G99 evidence, with exact object/command context, reason, expected evidence, stop/fix instruction and retained record
- Every remaining lab uses the same explicit where/action/why/expected/stop/record method and a preflight sheet naming the case, objects/data, command, outputs and hold point
- Accessible, deterministic SVG SLDs and engineering plots for every chapter, including textual descriptions, axes/units and visible illustrative-data boundaries
- A compact four-stage reading rail, progressive definitions, worked-example fading, focus reading and previous/next chapter navigation
- Foundation Zero teaches algebra, trigonometry, complex numbers, phasors/RMS, KCL/KVL, R/L/C, star/delta and basic dynamic-state calculus before the PowerFactory bootcamp and 16-step Mini-3B build
- Six local engineering practice tools: three-phase power/current, per-unit, Thevenin fault, voltage drop/rise, IEC IDMT and G98/G99 route screening
- 154-term linked technical glossary with automatic first-use hover, keyboard-focus and tap popovers
- A compact workplace quick card, four-sentence conclusion template and optional independent-practice checklist; reading progress is deliberately separate from professional competence
- Multi-turn local tutor that retrieves the whole book, indexes aliases, remembers topic/history/depth, completes missing-input calculations on the next turn, handles causal follow-ups such as PV-to-PQ limit behaviour, links official sources and refuses low-confidence answers
- Runnable PowerFactory Python and validity-gated test-evaluator patterns in Chapters 30–31
- Search across lessons, glossary and official sources
- Local progress, bookmarks, quiz attempts, theme and CPD evidence
- CPD CSV export with spreadsheet-formula neutralisation
- 42-source official UK/GB and DIgSILENT register checked 15 July 2026

All learner data—including tutor history—stays in browser `localStorage`. The tutor uses that history to keep the current topic and pending calculation context; it does not train a model on the conversation. Clearing site data or using **Clear** removes it. The tutor makes no API or network call and does not transmit questions anywhere.

## GitHub Pages/static hosting

This is a dependency-free static site published from the `gridreadyuk/gridreadyuk.github.io` repository. GitHub Pages serves it at `https://gridreadyuk.github.io/`. No serverless function, environment variable or paid API is needed. It can also be imported into any static host.

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
