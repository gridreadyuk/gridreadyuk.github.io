(function () {
  "use strict";
  const DATA = window.COURSE_DATA;
  const STORAGE_KEY = "gridready-uk-state-v1";
  const welcomeMessage = "Hi — I can teach from the whole book, remember the topic of our conversation, compare concepts, use worked examples and walk through PowerFactory procedures. Try “Teach me per-unit step by step” or “Show the Chapter 12 PowerFactory procedure”.";
  const defaultState = { schema: 1, completed: [], bookmarks: [], activity: [], cpd: [], quiz: {}, readiness: {}, masteryEvidence: {}, labProgress: {}, theme: "light", lastWeek: 1, tutor: { depth: "learner", messages: [], lastTopic: "", lastDocs: [], lastIntent: "", pendingCalculation: null } };
  let state = loadState();
  let currentView = "dashboard";
  let currentWeek = state.lastWeek || 1;
  let curriculumFilter = "all";
  let activeTermTrigger = null;
  let tutorReturnFocus = null;
  let tutorCorpus = [];
  let tutorStats = { avgLength: 1, docFreq: new Map() };
  let tutorGeneration = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]);

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.schema !== 1 || !Array.isArray(parsed.completed) || !Array.isArray(parsed.bookmarks)) return structuredClone(defaultState);
      const migrated = { ...structuredClone(defaultState), ...parsed };
      migrated.tutor = { ...structuredClone(defaultState.tutor), ...(parsed.tutor || {}) };
      migrated.readiness = parsed.readiness || {};
      migrated.masteryEvidence = parsed.masteryEvidence || {};
      migrated.labProgress = parsed.labProgress || {};
      migrated.tutor.depth = ["learner","engineer","deep"].includes(migrated.tutor.depth) ? migrated.tutor.depth : "learner";
      migrated.tutor.messages = Array.isArray(migrated.tutor.messages) ? migrated.tutor.messages.filter(m => m && ["user","assistant"].includes(m.role) && typeof m.text === "string").slice(-40).map(m=>({...m,citations:Array.isArray(m.citations)?m.citations.filter(c=>c&&typeof c.label==="string"&&((Number.isInteger(c.week)&&c.week>=1&&c.week<=32)||["tools","glossary","bootcamp","sources"].includes(c.view)||(/^https:\/\//.test(c.url||"")))):[]})) : [];
      migrated.tutor.lastDocs = Array.isArray(migrated.tutor.lastDocs) ? migrated.tutor.lastDocs.filter(x => typeof x === "string").slice(0,3) : [];
      if (!migrated.tutor.pendingCalculation || migrated.tutor.pendingCalculation.type !== "current" || !Number.isFinite(Number(migrated.tutor.pendingCalculation.s)) || Number(migrated.tutor.pendingCalculation.s) <= 0) migrated.tutor.pendingCalculation = null;
      return migrated;
    } catch (_) {
      return structuredClone(defaultState);
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { showToast("Progress could not be saved in this browser."); }
    updateProgressUI();
  }
  function logActivity(text) {
    state.activity.unshift({ text, at: new Date().toISOString() });
    state.activity = state.activity.slice(0, 12);
  }
  function showToast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function icon(kind) {
    return ({ check: "✓", time: "◷", book: "▤", lab: "⌁", formula: "∑", shield: "◇", arrow: "→", star: "✦" })[kind] || "•";
  }

  const linkableTerms = DATA.glossaryItems
    .filter(item => item.term.length >= 4 || /^[A-Z]\d|^[A-Z]{3,}$/.test(item.term))
    .sort((a, b) => b.term.length - a.term.length);
  const termPattern = new RegExp(`\\b(${linkableTerms.map(item => item.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  function termButton(label, item) { return `<button class="term" type="button" data-term="${esc(item.term)}" aria-haspopup="dialog" aria-controls="termPopover" aria-expanded="false">${esc(label)}</button>`; }
  function renderRich(text) {
    const explicit = [];
    const plain = String(text).replace(/\[\[([^\]]+)\]\]/g, (_, term) => {
      const item = DATA.glossaryMap[term.toLowerCase()];
      if (!item) return term;
      const token = `GRIDREADYTOKEN${explicit.length}END`;
      explicit.push(termButton(term, item));
      return token;
    });
    const tokens = plain.split(/(GRIDREADYTOKEN\d+END)/g);
    return tokens.map(part => {
      const tokenMatch = part.match(/^GRIDREADYTOKEN(\d+)END$/);
      if (tokenMatch) return explicit[Number(tokenMatch[1])];
      let output = ""; let last = 0;
      part.replace(termPattern, (match, _term, offset) => {
        output += esc(part.slice(last, offset));
        const item = DATA.glossaryMap[match.toLowerCase()];
        output += item ? termButton(match, item) : esc(match);
        last = offset + match.length;
        return match;
      });
      return output + esc(part.slice(last));
    }).join("");
  }
  function phaseFor(id) { return DATA.phases.find(p => p.id === id); }
  function weekFor(n) { return DATA.weeks.find(w => w.n === Number(n)); }
  function sourceFor(id) { return DATA.sources.find(s => s.id === id); }
  function chapterLabel(n) { return `Chapter ${Number(n)}`; }
  function isComplete(n) { return state.completed.includes(Number(n)); }
  function isBookmarked(n) { return state.bookmarks.includes(Number(n)); }
  function progressPct() { return Math.round((state.completed.length / DATA.weeks.length) * 100); }

  function updateProgressUI() {
    const pct = progressPct();
    $("#sideProgressValue").textContent = `${pct}%`;
    $("#sideProgressBar").style.width = `${pct}%`;
  }

  function showView(name, options = {}) {
    currentView = name;
    if (name !== "lesson") document.body.classList.remove("focus-reading");
    $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.viewPanel === name));
    $$(".nav-item").forEach(b => b.classList.toggle("is-active", b.dataset.view === name || (name === "lesson" && b.dataset.view === "curriculum")));
    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "instant" });
    closeSearch();
    closeMobileMenu();
  }

  function renderDashboard() {
    const next = DATA.weeks.find(w => !isComplete(w.n)) || DATA.weeks[DATA.weeks.length - 1];
    const hoursDone = DATA.weeks.filter(w => isComplete(w.n)).reduce((sum, w) => sum + w.hours, 0);
    const totalHours = DATA.weeks.reduce((sum, w) => sum + w.hours, 0);
    const recent = state.activity.length ? state.activity.slice(0, 4).map(a => `<div class="activity"><span class="activity-dot"></span><div><p>${esc(a.text).replace(/\bWeek\b/g, "Chapter")}</p><small>${formatDate(a.at)}</small></div></div>`).join("") : `<div class="activity"><span class="activity-dot"></span><div><p>Your learning activity will appear here.</p><small>Start Chapter 1 or resume your last chapter.</small></div></div>`;
    $("#dashboardView").innerHTML = `
      <section class="hero">
        <div>
          <p class="eyebrow">A 32-chapter professional engineering book</p>
          <h1>Learn the grid from first principles.</h1>
          <p class="lead">Read in sequence from electrical foundations to professional PowerFactory studies, protection coordination and a defensible UK grid-connection evidence pack.</p>
          <div class="hero-actions">
            <button class="primary-button" ${state.completed.length ? `data-open-week="${next.n}"` : `data-go="bootcamp"`}>${state.completed.length ? "Continue reading" : "Read Foundation Zero"} ${icon("arrow")}</button>
            <button class="secondary-button" data-go="curriculum">Open the contents</button>
          </div>
        </div>
        <div class="hero-stats" aria-label="Course summary">
          <div class="hero-stat"><strong>32 chapters</strong><span>Intuition → equation → example → software → evidence</span></div>
          <div class="hero-stat"><strong>${totalHours}+ hours</strong><span>Self-paced; one chapter per week is a sensible rhythm</span></div>
          <div class="hero-stat"><strong>${DATA.glossaryItems.length} terms</strong><span>Hover, focus or tap for plain-English help</span></div>
        </div>
      </section>
      <div class="jurisdiction-banner"><strong>Jurisdiction:</strong> Great Britain (England, Scotland and Wales). Northern Ireland uses SONI/NIE Networks arrangements and G98/NI/G99/NI; re-verify every live document and project agreement before professional use.</div>
      <section class="metric-grid" aria-label="Your learning metrics">
        ${metric("Book progress", `${progressPct()}%`, `${state.completed.length} of ${DATA.weeks.length} chapters`, "check")}
        ${metric("Learning evidence", `${hoursDone} h`, "Estimated completed study", "time")}
        ${metric("Bookmarks", state.bookmarks.length, "Saved chapters", "book")}
        ${metric("Source baseline", "Jul 2026", `Grid Code Rev 42 · G99 Issue 2`, "shield")}
      </section>
      <section class="dashboard-grid">
        <div class="panel">
          <div class="panel-head"><h2>Parts of the book</h2><button class="text-button" data-go="curriculum">Open contents →</button></div>
          <div class="phase-list">
            ${DATA.phases.map((p, i) => {
              const range = p.weeks.split("–").map(Number); const nums = DATA.weeks.filter(w => w.n >= range[0] && w.n <= range[1]);
              const done = nums.filter(w => isComplete(w.n)).length;
              return `<div class="phase-row"><span class="phase-number">${i + 1}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p></div><span>${done}/${nums.length} · Chapters ${esc(p.weeks)}</span></div>`;
            }).join("")}
          </div>
        </div>
        <div>
          <div class="continue-card">
            <span class="tag">Next recommended</span>
            <h3>Chapter ${next.n}: ${esc(next.title)}</h3>
            <p>${esc(next.summary)}</p>
            <button class="secondary-button" data-open-week="${next.n}">Open chapter ${icon("arrow")}</button>
          </div>
          <div class="panel activity-panel">
            <div class="panel-head"><h3>Recent activity</h3></div>
            <div class="activity-list">${recent}</div>
          </div>
        </div>
      </section>`;
    bindCommon($("#dashboardView"));
  }
  function metric(label, value, note, kind) {
    return `<div class="metric-card"><div class="metric-label"><span>${esc(label)}</span><span class="metric-icon">${icon(kind)}</span></div><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
  }

  function renderCurriculum(filter = curriculumFilter) {
    curriculumFilter = filter;
    let list = DATA.weeks;
    if (filter === "bookmarks") list = list.filter(w => isBookmarked(w.n));
    else if (filter !== "all") list = list.filter(w => w.phase === filter);
    $("#curriculumView").innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">Table of contents</p><h1>The Power Systems Engineer's Book</h1><p>Read in order. Every chapter follows the same learning journey: intuition, precise definitions, equations, a worked example, a visual map, PowerFactory practice and workplace evidence.</p></div><span class="tag blue">${DATA.weeks.reduce((a,w)=>a+w.hours,0)} guided hours</span></div>
      <section class="book-reading-key" aria-label="How every chapter teaches"><strong>How to use the book</strong><ol><li>Build the mental model.</li><li>Learn the exact language.</li><li>Derive and check the equations.</li><li>Follow the worked example.</li><li>Reproduce the PowerFactory study.</li><li>Explain and evidence the decision.</li></ol></section>
      <article class="book-prologue"><span>Read before Chapter 1</span><div><h2>Prologue: Foundation Zero</h2><p>Units, algebra, trigonometry, complex numbers, RMS, phasors, KCL, KVL, R/L/C, three-phase power and the PowerFactory object hierarchy are taught here without assuming prior mastery.</p></div><button class="secondary-button" type="button" data-go="bootcamp">Open the foundation and lab manual →</button></article>
      <div class="filter-bar" role="group" aria-label="Filter curriculum">
        ${filterButton("all", "All chapters", filter)}
        ${DATA.phases.map(p => filterButton(p.id, p.name, filter)).join("")}
        ${filterButton("bookmarks", `Bookmarked (${state.bookmarks.length})`, filter)}
      </div>
      <div class="book-parts">
        ${list.length ? DATA.phases.map((part, partIndex) => {
          const chapters = list.filter(w => w.phase === part.id);
          if (!chapters.length) return "";
          return `<section class="book-part"><header><span>Part ${partIndex + 1}</span><div><h2>${esc(part.name)}</h2><p>${esc(part.description)}</p></div><strong>Chapters ${esc(part.weeks)}</strong></header><div class="week-grid">${chapters.map(weekCard).join("")}</div></section>`;
        }).join("") : `<div class="empty-state"><h2>No bookmarked chapters yet</h2><p>Use the heart on a chapter card to save it here.</p></div>`}
      </div>`;
    $$(".filter-button", $("#curriculumView")).forEach(b => b.addEventListener("click", () => renderCurriculum(b.dataset.filter)));
    $$("[data-open-week]", $("#curriculumView")).forEach(b => b.addEventListener("click", () => openWeek(b.dataset.openWeek)));
    $$(".bookmark-toggle", $("#curriculumView")).forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); toggleBookmark(Number(b.dataset.bookmark)); renderCurriculum(curriculumFilter); }));
    $$('[data-go]', $("#curriculumView")).forEach(b => b.addEventListener('click',()=>navigate(b.dataset.go)));
  }
  function filterButton(id, label, active) { return `<button class="filter-button ${active === id ? "is-active" : ""}" data-filter="${id}">${esc(label)}</button>`; }
  function weekCard(w) {
    const phase = phaseFor(w.phase);
    return `<article class="week-card ${isComplete(w.n) ? "is-complete" : ""}">
      <div class="week-top"><span class="week-index">Chapter ${w.n} · ${esc(phase.name)}</span><button class="bookmark-toggle ${isBookmarked(w.n) ? "is-bookmarked" : ""}" data-bookmark="${w.n}" aria-label="${isBookmarked(w.n) ? "Remove bookmark" : "Bookmark"} chapter ${w.n}">${isBookmarked(w.n) ? "♥" : "♡"}</button></div>
      <h2>${esc(w.title)}</h2><p>${esc(w.summary)}</p>
      <div class="week-meta"><span>${w.hours} hours · ${esc(w.difficulty)}</span><span>${isComplete(w.n) ? "✓ Complete" : `${w.mastery?.formulas.length||0} formulas · worked example · lab`}</span></div>
      <button class="week-card-open" data-open-week="${w.n}" aria-label="Open Chapter ${w.n}: ${esc(w.title)}"></button>
    </article>`;
  }

  function openWeek(n, anchor = "") {
    const w = weekFor(n); if (!w) return;
    currentWeek = w.n; state.lastWeek = w.n; saveState();
    renderLesson(w); showView("lesson"); updateTutorContext();
    document.title = `Chapter ${w.n}: ${w.title} — GridReady UK`;
    history.replaceState(null, "", `#chapter-${w.n}${anchor ? `/${anchor}` : ""}`);
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView(), 0);
    else requestAnimationFrame(() => { const heading = $("#lessonView h1"); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } });
  }
  function concise(value, limit = 92) {
    const text = String(value || "").replace(/\[\[|\]\]/g, "").replace(/\s+/g, " ").trim();
    return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
  }
  function renderChapterJourney(w) {
    const stages = [
      ["1", "Orient", "What question are we solving?", concise(w.summary), "teacher-start"],
      ["2", "Understand", "Build the mental model", concise(w.teacher?.mentalModel || w.summary), "teacher-start"],
      ["3", "Learn", "Read the physical mechanism", w.sections[0]?.title || "Core theory", w.sections[0]?.id || "mastery-pack"],
      ["4", "Calculate", "Own the governing method", w.mastery?.formulas?.[0]?.title || "Engineering method", "mastery-pack"],
      ["5", "Rehearse", "Follow a complete example", w.mastery?.example?.title || "Worked example", "mastery-pack"],
      ["6", "Apply", "Reproduce it in PowerFactory", concise(w.lab?.title || "PowerFactory lab"), "powerfactory-lab"],
      ["7", "Defend", "Turn the result into evidence", concise(w.teacher?.workplace || w.lab?.deliverable), "mastery-practice"]
    ];
    return `<section class="chapter-journey" id="chapter-map"><div class="chapter-journey-head"><div><p class="eyebrow">The chapter map</p><h2>See the whole engineering story before reading the detail</h2></div><p>Follow the arrows once for understanding, then return to individual stages while solving the lab.</p></div><div class="journey-flow" role="list" aria-label="Seven-stage learning journey">${stages.map((s, i) => `<button type="button" class="journey-node" data-scroll-target="${esc(s[4])}" role="listitem"><span>${s[0]}</span><small>${esc(s[1])}</small><strong>${esc(s[2])}</strong><em>${esc(s[3])}</em>${i < stages.length - 1 ? `<b aria-hidden="true">→</b>` : ""}</button>`).join("")}</div></section>`;
  }
  function renderChapterNavigation(w) {
    const previous = weekFor(w.n - 1); const next = weekFor(w.n + 1);
    return `<nav class="chapter-pagination" aria-label="Chapter navigation">${previous ? `<button class="chapter-page-link previous" data-open-week="${previous.n}"><span>Previous chapter</span><strong>← ${previous.n}. ${esc(previous.title)}</strong></button>` : `<span></span>`}${next ? `<button class="chapter-page-link next" data-open-week="${next.n}"><span>Next chapter</span><strong>${next.n}. ${esc(next.title)} →</strong></button>` : `<button class="chapter-page-link next" data-go="cpd"><span>Book complete</span><strong>Prepare the CPD record →</strong></button>`}</nav>`;
  }
  function renderLesson(w) {
    const phase = phaseFor(w.phase);
    const sourceCards = w.sources.map(sourceFor).filter(Boolean);
    $("#lessonView").innerHTML = `
      <button class="lesson-back" data-go="curriculum">← Back to contents</button>
      <div class="lesson-shell">
        <article class="lesson-main">
          <header class="lesson-header">
            <div class="chapter-kicker"><p class="eyebrow">Part ${DATA.phases.findIndex(p => p.id === w.phase) + 1} · Chapter ${w.n} · ${esc(phase.name)}</p><button class="text-button focus-reading-button" type="button" data-focus-reading>Focus reading</button></div>
            <h1>${esc(w.title)}</h1>
            <p class="lead">${esc(w.summary)}</p>
            <div class="lesson-meta"><span>${icon("time")} ${w.hours} guided hours</span><span>${icon("star")} ${esc(w.difficulty)}</span><span>${icon("book")} ${w.sections.length} concept sections</span><span>${icon("formula")} ${w.mastery?.formulas.length||0} formula/method cards</span><span>${icon("lab")} 1 PowerFactory runbook</span></div>
            <div class="lesson-outcomes"><h3>After mastering this chapter, you can:</h3><ul>${w.outcomes.map(o => `<li>${renderRich(o)}</li>`).join("")}</ul></div>
          </header>
          ${renderChapterJourney(w)}
          ${renderTeacherStart(w)}
          ${renderMasteryPack(w)}
          ${w.sections.map((s, i) => renderSection(s, i)).join("")}
          ${renderLab(w.lab)}
          ${renderMasteryPractice(w)}
          ${renderMasteryChecks(w)}
          ${renderQuiz(w)}
          <section class="lesson-section" id="sources"><h2>Source and version notes</h2><p>These sources govern the concepts and current UK context. For project work, open the live register and confirm document status, detailed clauses, connection agreement and DNO/TO policy.</p>
            <div class="source-grid">${sourceCards.map(sourceMini).join("")}</div>
          </section>
          <section class="lesson-section"><h2>Chapter evidence checklist</h2><ul><li>Concepts explained in your own words, with symbols and units.</li><li>At least one independent hand/sensitivity check reconciled with PowerFactory.</li><li>Model, data, Study Case and source revisions recorded.</li><li>Assumptions, limitations and unresolved queries visible.</li><li>Deliverable peer-reviewed and CPD reflection logged.</li></ul></section>
          ${renderChapterNavigation(w)}
        </article>
        <aside class="lesson-aside">
          <nav class="lesson-nav" aria-label="On this page"><strong>In this chapter</strong><a href="#chapter-map">Chapter map</a><a href="#teacher-start">Start with intuition</a><a href="#mastery-pack">Definitions, formulas & example</a>${w.sections.map((s,i) => `<a href="#${s.id}">${i+1}. ${esc(s.title)}</a>`).join("")}<a href="#powerfactory-lab">PowerFactory runbook</a><a href="#mastery-practice">Independent practice</a><a href="#mastery-checks">Six mastery checks</a><a href="#knowledge-check">Knowledge check</a><a href="#sources">Sources</a></nav>
          <div class="lesson-progress-card"><strong>${isComplete(w.n) ? "Chapter complete" : "Evidence gate"}</strong><p class="text-muted">Complete six mastery records and answer both retrieval questions correctly before marking this chapter complete.</p><button class="primary-button complete-button ${isComplete(w.n) ? "is-complete" : ""}" data-complete="${w.n}">${isComplete(w.n) ? "✓ Completed — undo" : "Mark chapter complete"}</button></div>
        </aside>
      </div>`;
    bindCommon($("#lessonView"));
    bindTerms($("#lessonView"));
    $$(".lesson-nav a", $("#lessonView")).forEach(link => link.addEventListener("click", e => {
      e.preventDefault();
      const anchor = link.getAttribute("href").slice(1);
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${w.id}/${anchor}`);
    }));
    $("[data-complete]", $("#lessonView")).addEventListener("click", () => toggleComplete(w.n));
    bindQuiz(w);
    bindReadiness(w);
    bindMasteryChecks(w);
    bindLabProgress(w);
    $$('[data-scroll-target]', $("#lessonView")).forEach(button => button.addEventListener("click", () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" })));
    $("[data-focus-reading]", $("#lessonView"))?.addEventListener("click", button => {
      document.body.classList.toggle("focus-reading");
      button.currentTarget.textContent = document.body.classList.contains("focus-reading") ? "Exit focus" : "Focus reading";
    });
    updateTutorContext();
  }
  function renderTeacherStart(w) {
    const t = w.teacher;
    if (!t) return "";
    const previous = w.n > 1 ? `I can explain the main idea from Chapter ${w.n - 1}: ${weekFor(w.n - 1).title}.` : "I can use a calculator and rearrange simple equations.";
    const ready = [previous, w.n > 1 ? "I have completed or reviewed the previous chapter’s evidence artifact." : "I can read voltage levels and connections on a simple single-line diagram.", String(t.foundation).replace(/\bWeek\b/g, "Chapter")];
    return `<section class="lesson-section teacher-start" id="teacher-start"><p class="eyebrow">Teacher’s briefing</p><h2>Start with the physical story, then add the mathematics</h2>
      <div class="mental-model"><h3>Big picture</h3><p>${renderRich(t.mentalModel)}</p></div>
      <div class="teacher-grid"><div><h3>Readiness check</h3><p class="text-muted">Tick honestly. Unticked items are a signal to revise, not a failure.</p>${ready.map((item,i)=>`<label class="readiness-item"><input type="checkbox" data-ready="${w.n}-${i}" ${state.readiness[`${w.n}-${i}`] ? "checked" : ""}><span>${renderRich(item)}</span></label>`).join("")}</div>
      <div><h3>Misconceptions to avoid</h3><ul>${t.mistakes.map(m=>`<li>${renderRich(m)}</li>`).join("")}</ul></div></div>
      <div class="workplace-target"><strong>Workplace target</strong><p>${renderRich(t.workplace)}</p></div>
      <button class="secondary-button" type="button" data-teach-week="${w.n}">Teach this chapter to me step by step</button></section>`;
  }
  function renderMasteryPack(w) {
    const m=w.mastery;if(!m)return "";
    const definitions=m.definitions.map(name=>DATA.glossaryMap[name.toLowerCase()]||{term:name,short:"This term is introduced in the lesson below.",detail:"Use the lesson context and ask the tutor for the exact boundary and application."});
    return `<section class="lesson-section mastery-pack" id="mastery-pack"><p class="eyebrow">Core chapter reading</p><h2>Language, equations and a complete worked example</h2><p class="mastery-reading">${renderRich(m.reading)}</p>
      <div class="reading-instruction"><strong>Read this in three passes</strong><span>First read the plain meanings.</span><span>Then follow the equation with units.</span><span>Finally close the answer and reproduce the example yourself.</span></div>
      <h3>Essential definitions</h3><p class="text-muted">The plain meaning is always visible. Open the professional detail when the idea is clear; it adds the boundary, convention and engineering precision.</p><div class="definition-grid">${definitions.map(d=>`<article class="definition-card"><h4>${esc(d.term)}${d.unit?` <small>${esc(d.unit)}</small>`:""}</h4><p class="definition-plain">${renderRich(d.short)}</p><details><summary>Professional definition and boundary</summary><p>${renderRich(d.detail)}</p>${d.aliases?`<span>Also called: ${esc(d.aliases)}</span>`:""}</details></article>`).join("")}</div>
      <h3>Formula and method sheet</h3><p class="text-muted">An equation is safe only when its symbols, units, sign convention and application boundary travel with it.</p><div class="formula-grid">${m.formulas.map((f,i)=>`<article class="formula-card"><span class="formula-index">F${i+1}</span><h4>${esc(f.title)}</h4><div class="formula" aria-label="${esc(f.title)} equation">${esc(f.equation)}</div><div class="formula-reading"><span><b>1</b> Declare the known values and units.</span><span><b>2</b> Check the assumptions and sign convention.</span><span><b>3</b> Substitute without changing unit scale.</span><span><b>4</b> Sanity-check magnitude and physical direction.</span></div><dl><dt>Symbols and units</dt><dd>${renderRich(f.symbols)}</dd><dt>When it applies</dt><dd>${renderRich(f.assumptions)}</dd><dt>Common trap</dt><dd>${renderRich(f.trap)}</dd></dl></article>`).join("")}</div>
      <h3>Fully worked example</h3><article class="full-example"><header><span>Worked example</span><h4>${esc(m.example.title)}</h4></header><p class="example-problem"><strong>Problem:</strong> ${renderRich(m.example.problem)}</p><div class="worked-solution-steps">${m.example.steps.map((step,i)=>`<article><span>${i+1}</span><div><small>${i===0?"Set up":i===m.example.steps.length-1?"Check and conclude":"Calculate"}</small><p>${renderRich(step)}</p></div></article>`).join("")}</div><div class="example-answer"><strong>Answer</strong><p>${renderRich(m.example.answer)}</p></div><p><strong>Professional interpretation:</strong> ${renderRich(m.example.interpretation)}</p><details class="faded-practice"><summary>Now remove the scaffolding</summary><p>Change one stated input while keeping the same method. Before calculating, write the expected direction of change. Then solve, check units and explain any limit, discontinuity or non-linearity. This is the bridge from copying an example to engineering independently.</p></details></article>
      ${m.routeTable ? `<h3>Dated professional route map</h3><div class="route-table">${m.routeTable.map(row=>`<article><strong>${esc(row[0])}</strong><p>${renderRich(row[1])}</p></article>`).join("")}</div>` : ""}
      ${m.code ? `<h3>Runnable implementation pattern</h3><p class="text-muted">Read every assertion before adapting this to a controlled project. Object attributes and APIs can vary with PowerFactory version and model.</p><pre class="code-sample"><code>${esc(m.code)}</code></pre>` : ""}
    </section>`;
  }
  function renderSection(s, i) {
    return `<section class="lesson-section concept-reading" id="${esc(s.id)}"><p class="eyebrow">Concept ${i + 1}</p><h2>${esc(s.title)}</h2><div class="concept-question"><span>Question to hold while reading</span><strong>What changes physically, what must be calculated, and what decision does the result support?</strong></div>${s.paragraphs.map((p,pi) => `<p class="concept-paragraph" data-paragraph="${pi+1}">${renderRich(p)}</p>`).join("")}${s.formula ? `<div class="formula" role="note" aria-label="Formula">${esc(s.formula)}</div>` : ""}${s.example ? `<div class="worked-example"><h3>Worked reasoning</h3><p>${renderRich(s.example)}</p></div>` : ""}${s.warning ? `<div class="warning-note"><strong>Engineering caution</strong><p>${renderRich(s.warning)}</p></div>` : ""}<details class="concept-self-check"><summary>Pause and explain it without looking</summary><p>State the input, physical mechanism, output quantity and one assumption in your own words. If you cannot do that yet, reread only the paragraph that contains the missing link and ask the tutor for a simpler explanation.</p></details></section>`;
  }
  function renderLab(lab) {
    const steps = lab.guidedSteps || lab.steps.map(action => ({ action, why: "Required by the study method.", expected: "The intended state or result is visible.", troubleshoot: "Check case, data, units and calculation status." }));
    const r=lab.recipe;
    return `<section class="lesson-section" id="powerfactory-lab"><p class="eyebrow">Applied practice</p><h2>PowerFactory runbook: prepare, perform, prove and record</h2><p>Do not use this as a list of clicks. At every step you must know why the object or option exists, what result should appear and which evidence makes the run reproducible.</p><div class="pf-version-note"><strong>Version boundary:</strong> Stable concepts and object/command classes are used below. Exact menu positions, library models, result-variable labels and licence modules can differ in PowerFactory 2025/2026. Use object Help and the installed User Manual/Technical References when a label differs; never guess an attribute.</div><div class="pf-lab"><span class="tag">Teacher-guided runbook</span><h3>${esc(lab.title)}</h3><p><strong>Engineering aim:</strong> ${renderRich(lab.aim)}</p>${r?`<div class="pf-recipe"><h4>Pre-flight sheet — complete before calculating</h4><div class="preflight-grid"><span><b>1. Active context</b>${renderRich(r.studyCase)}</span><span><b>2. Required model and data</b>${renderRich(r.objects)}</span><span><b>3. Calculation command</b>${renderRich(r.command)}</span><span><b>4. Results and evidence</b>${renderRich(r.outputs)}</span></div><div class="lab-hold-point"><strong>Stop/go criterion</strong><p>${renderRich(r.holdPoint)}</p></div></div>`:""}<div class="lab-method-legend" aria-label="Method used for every step"><span>Prepare</span><span>Perform</span><span>Verify</span><span>Record</span></div><div class="guided-steps">${steps.map((s,i) => `<article class="guided-step"><div class="guided-step-marker"><span class="step-number">${i+1}</span><label><input type="checkbox" data-lab-step="${currentWeek}-${i}" ${state.labProgress[`${currentWeek}-${i}`] ? "checked" : ""}><span>Recorded</span></label></div><div><p class="step-phase">Major step ${i+1} of ${steps.length}</p><h4>${renderRich(s.action)}</h4><div class="step-runbook"><section><strong>Before you act</strong><p>${renderRich(s.why)}</p></section><section><strong>Perform in PowerFactory</strong><p>${renderRich(s.action)}</p></section><section><strong>Verify the result</strong><p>${renderRich(s.expected)}</p></section><section><strong>If the result differs</strong><p>${renderRich(s.troubleshoot)}</p></section></div><p class="record-prompt"><strong>Record before continuing:</strong> active Study Case/scenario/variation, changed object or option, calculation status, expected-versus-observed result and the filename or table containing evidence.</p></div></article>`).join("")}</div><h4>Independent validation gates — do not skip</h4><ul>${lab.checks.map(c => `<li>${renderRich(c)}</li>`).join("")}</ul></div><div class="deliverable"><strong>Workplace deliverable:</strong> ${renderRich(lab.deliverable)}</div></section>`;
  }
  function bindLabProgress(w) {
    $$(`[data-lab-step^="${w.n}-"]`, $("#lessonView")).forEach(input => input.addEventListener("change", () => {
      state.labProgress[input.dataset.labStep] = input.checked;
      saveState();
      showToast(input.checked ? "Runbook checkpoint recorded locally." : "Runbook checkpoint reopened.");
    }));
  }
  function renderMasteryPractice(w) {
    const t = w.teacher;
    return `<section class="lesson-section" id="mastery-practice"><p class="eyebrow">Apply without copying</p><h2>Your independent engineering practice</h2><div class="practice-grid">
      <article><h3>1. Teach it back</h3><p>Without looking above, explain this mental model in your own words: ${renderRich(t?.mentalModel || w.summary)}</p></article>
      <article><h3>2. Change one input</h3><p>Predict which outputs move, in which direction and why. Then change one controlled input in a copy of the Study Case and reconcile the result.</p></article>
      <article><h3>3. Diagnose a bad result</h3><p>Introduce one listed misconception or lab failure deliberately. Record the symptom, physical reason, check that detects it and correction.</p></article>
      <article><h3>4. Write the conclusion</h3><p>Write four sentences: question, controlling input/method, quantified result against criterion, and limitation/action. Avoid “looks okay”.</p></article>
    </div><div class="mastery-rule"><strong>Mastery rule:</strong> answer both retrieval questions correctly, complete all six written evidence records and reproduce the lab after closing/reopening the project. If you cannot explain a result without the screen, revisit the mental model and hand check.</div></section>`;
  }
  function renderMasteryChecks(w) {
    const m = w.mastery;
    const prompts = [
      `Without notes, define ${m.definitions[0]} and ${m.definitions[1]}, including boundary and units where applicable.`,
      `Write “${m.formulas[0].equation}” from memory and define every symbol, unit and sign convention.`,
      `State when “${m.formulas[1].title}” applies and explain its common trap.`,
      `Rework “${m.example.title}” independently, showing units and one order-of-magnitude check.`,
      `Change one input in the example, predict the direction first, then explain any non-linearity, limit or discontinuity.`,
      `Reproduce the PowerFactory runbook after reopening the project; retain the active case, calculation status, hand check and workplace deliverable.`
    ];
    const done = prompts.filter((_,i)=>evidenceQuality(state.masteryEvidence[`${w.n}-${i}`]||"").pass).length;
    return `<section class="lesson-section" id="mastery-checks"><p class="eyebrow">Evidence before completion</p><h2>Six technical mastery checks</h2><p>These are production tasks, not confidence ratings. A record passes the local structure check only when it is substantive and includes technical context, a verification action and a conclusion. The website cannot judge engineering correctness: use the answer material, official source and competent review. <strong>${done}/6 structurally complete.</strong></p><div class="mastery-check-list">${prompts.map((p,i)=>{const value=state.masteryEvidence[`${w.n}-${i}`]||"";const quality=evidenceQuality(value);return `<label class="mastery-evidence"><span><strong>Check ${i+1}.</strong> ${renderRich(p)}</span><textarea rows="6" minlength="120" data-mastery-evidence="${w.n}-${i}" placeholder="State values/units or model boundary, method/source, verification performed, result and conclusion…">${esc(value)}</textarea><small>${quality.pass?"Structure check passed; engineering correctness still requires review.":`Still needed: ${esc(quality.missing.join(", "))}.`}</small></label>`;}).join("")}</div></section>`;
  }
  function evidenceQuality(value) {
    const text = String(value || "").trim();
    const words = text.split(/\s+/).filter(Boolean);
    const checks = [
      [text.length >= 120 && words.length >= 18, "a substantive explanation"],
      [/\b(kv|mw|mvar|mva|ka|hz|ohm|pu|percent|seconds?|amps?|volts?|model|study case|boundary|source|clause|artifact)\b|%/i.test(text), "units, boundary, source or named artifact"],
      [/\b(check|checked|verify|verified|compare|compared|reconcile|reconciled|calculate|calculated|review|tested|assumption|limit)\w*\b/i.test(text), "a verification action"],
      [/\b(result|therefore|because|conclusion|conclude|pass|fail|acceptable|action|limitation)\w*\b/i.test(text), "a result, conclusion or limitation"]
    ];
    return { pass: checks.every(([ok]) => ok), missing: checks.filter(([ok]) => !ok).map(([,label]) => label) };
  }
  function bindMasteryChecks(w) {
    $$(`[data-mastery-evidence^="${w.n}-"]`, $("#lessonView")).forEach(input => input.addEventListener("change", () => { state.masteryEvidence[input.dataset.masteryEvidence] = input.value.trim().slice(0,4000); saveState(); const quality=evidenceQuality(input.value); showToast(quality.pass?"Mastery evidence structure saved locally.":`Evidence needs ${quality.missing[0]}.`); renderLesson(w); }));
  }
  function bindReadiness(w) {
    $$(`[data-ready^="${w.n}-"]`, $("#lessonView")).forEach(input => input.addEventListener("change", () => { state.readiness[input.dataset.ready] = input.checked; saveState(); }));
    $("[data-teach-week]", $("#lessonView"))?.addEventListener("click", () => openTutor(`Teach me Chapter ${w.n} step by step, starting with the prerequisites`));
  }
  function renderQuiz(w) {
    return `<section class="lesson-section" id="knowledge-check"><p class="eyebrow">Retrieval practice</p><h2>Knowledge check</h2><p>Answer first, then use the feedback to correct your mental model.</p><div class="quiz">${w.quizzes.map((q, qi) => `<fieldset class="quiz-question" data-quiz="${qi}"><legend>${qi + 1}. ${esc(q.question)}</legend>${q.options.map((o, oi) => `<label class="quiz-option"><input type="radio" name="quiz-${w.n}-${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join("")}<button class="secondary-button quiz-check" type="button" data-q="${qi}">Check answer</button><div class="quiz-feedback" role="status"></div></fieldset>`).join("")}</div></section>`;
  }
  function bindQuiz(w) {
    $$(".quiz-check", $("#lessonView")).forEach(button => button.addEventListener("click", () => {
      const qi = Number(button.dataset.q); const field = button.closest("fieldset"); const picked = $("input:checked", field); const feedback = $(".quiz-feedback", field);
      if (!picked) { feedback.className = "quiz-feedback show incorrect"; feedback.textContent = "Choose an answer first."; return; }
      const correct = Number(picked.value) === w.quizzes[qi].answer;
      feedback.className = `quiz-feedback show ${correct ? "correct" : "incorrect"}`;
      feedback.textContent = `${correct ? "Correct. " : "Not yet. "}${w.quizzes[qi].explanation}`;
      state.quiz[`${w.n}-${qi}`] = { answer: Number(picked.value), correct, at: new Date().toISOString() }; saveState();
    }));
  }
  function sourceMini(s) { return `<article class="source-card"><span class="tag ${s.category.includes("Mandatory") || s.category === "Law" ? "amber" : "blue"}">${esc(s.category)}</span><h2>${esc(s.title)}</h2><p>${esc(s.publisher)} · ${esc(s.edition)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Open official source ↗</a></article>`; }

  function toggleComplete(n) {
    const idx = state.completed.indexOf(n);
    if (idx >= 0) { state.completed.splice(idx, 1); logActivity(`Reopened Chapter ${n}`); showToast("Chapter marked incomplete."); }
    else {
      const checks = Array.from({length:6},(_,i)=>evidenceQuality(state.masteryEvidence[`${n}-${i}`]||"").pass).filter(Boolean).length;
      const quizPasses = weekFor(n).quizzes.filter((_,i)=>state.quiz[`${n}-${i}`]?.correct).length;
      if (checks < 6 || quizPasses < weekFor(n).quizzes.length) {
        showToast(`Evidence gate: ${checks}/6 mastery checks and ${quizPasses}/${weekFor(n).quizzes.length} quiz answers complete.`);
        document.getElementById(checks < 6 ? "mastery-checks" : "knowledge-check")?.scrollIntoView({behavior:"smooth"});
        return;
      }
      state.completed.push(n); state.completed.sort((a,b)=>a-b); logActivity(`Completed Chapter ${n}: ${weekFor(n).title}`); showToast("Chapter complete — evidence gate passed and progress saved.");
    }
    saveState(); renderLesson(weekFor(n));
  }
  function toggleBookmark(n) {
    const idx = state.bookmarks.indexOf(n);
    if (idx >= 0) { state.bookmarks.splice(idx, 1); showToast("Bookmark removed."); }
    else { state.bookmarks.push(n); logActivity(`Bookmarked Chapter ${n}`); showToast("Chapter bookmarked."); }
    saveState();
  }

  function renderBootcamp() {
    const b = window.TEACHER_DATA.bootcamp;
    const sourceCards = b.sourceIds.map(sourceFor).filter(Boolean);
    $("#bootcampView").innerHTML = `<div class="page-heading"><div><p class="eyebrow">Compulsory foundation + software orientation</p><h1>PowerFactory lab manual</h1><p>Start here if any mathematical, electrical or software foundation feels uncertain. Then use the detailed runbook inside every chapter.</p></div><span class="tag blue">PowerFactory 2025/2026 aware</span></div>
      <div class="source-banner"><strong>Version and licence boundary</strong><p>${esc(b.versionNote)}</p></div>
      <section class="bootcamp-section"><h2>Foundation Zero — mathematics and circuit reasoning from first principles</h2><p>Do not treat these as assumed prerequisites. Work every example and retrieval check before Chapter 2 if any step is unfamiliar.</p><div class="fundamentals-grid">${b.mathPrimer.map((f,i)=>`<article class="foundation-card"><span class="step-number">0.${i+1}</span><h3>${esc(f.title)}</h3><p>${renderRich(f.lesson)}</p><div class="worked-example"><h4>Derivation</h4><p>${renderRich(f.derivation)}</p><h4>Worked example</h4><p>${renderRich(f.example)}</p></div><p class="foundation-check"><strong>Retrieval check:</strong> ${renderRich(f.check)}</p></article>`).join("")}</div></section>
      <section class="bootcamp-section"><h2>Part A — electrical foundations you must own</h2><div class="fundamentals-grid">${b.fundamentals.map((f,i)=>`<article class="foundation-card"><span class="step-number">${i+1}</span><h3>${esc(f.title)}</h3><p>${renderRich(f.idea)}</p><div class="formula">${esc(f.formula)}</div><div class="worked-example"><h4>Worked meaning</h4><p>${renderRich(f.example)}</p></div><p class="foundation-check"><strong>Check:</strong> ${renderRich(f.check)}</p></article>`).join("")}</div></section>
      <section class="bootcamp-section"><h2>Part B — understand the PowerFactory database</h2><p>A drawing is only one view of an object-oriented database. Learn this hierarchy before clicking calculation buttons.</p><div class="hierarchy-flow">${b.hierarchy.map((row,i)=>`<article><span>${i+1}</span><div><strong>${esc(row[0])}</strong><p>${renderRich(row[1])}</p></div></article>`).join("")}</div></section>
      <section class="bootcamp-section"><h2>Part C — build and prove the Mini-3B benchmark</h2><p>Follow all 16 steps in order. Each step explains the action, physical reason and evidence of success. Do not move on with an unexplained warning.</p><div class="mini3b-sld" role="img" aria-label="Mini-3B 33 and 11 kilovolt radial single line diagram"><span>External grid<br><b>33 kV · 500 MVA</b></span><i></i><span>Transformer<br><b>20 MVA · Dyn11 · 10%</b></span><i></i><span>Cable<br><b>3 km · 11 kV</b></span><i></i><span>Load<br><b>8 MW · 0.95 lag</b></span></div><div class="bootcamp-steps">${b.mini3b.map(s=>`<article><span class="step-number">${esc(s[0])}</span><div><h3>${esc(s[1])}</h3><p><strong>Action:</strong> ${renderRich(s[2])}</p><p><strong>Why:</strong> ${renderRich(s[3])}</p><p><strong>Proof before continuing:</strong> ${renderRich(s[4])}</p></div></article>`).join("")}</div></section>
      <section class="bootcamp-section"><h2>Part D — repeatable study workflows</h2><div class="workflow-grid">${b.workflows.map(w=>`<article class="panel"><h3>${esc(w.title)}</h3><ol>${w.steps.map(s=>`<li>${renderRich(s)}</li>`).join("")}</ol></article>`).join("")}</div></section>
      <section class="bootcamp-section"><h2>Official PowerFactory references</h2><p>These public pages verify capabilities and stable concepts. Detailed field definitions belong to your installed User Manual and Technical References.</p><div class="source-grid">${sourceCards.map(sourceMini).join("")}</div></section>`;
    bindTerms($("#bootcampView"));
  }

  function calculatorCard(id, title, note, fields, outputId) {
    return `<article class="calculator-card" id="${id}"><h2>${esc(title)}</h2><p>${esc(note)}</p><div class="calculator-fields">${fields}</div><div class="calculator-output" id="${outputId}" aria-live="polite">Enter valid values to calculate.</div></article>`;
  }
  function field(label, name, value, unit, options = {}) {
    const input = options.select ? `<select name="${name}">${options.select.map(o=>`<option value="${o[0]}">${esc(o[1])}</option>`).join("")}</select>` : `<input name="${name}" type="number" value="${value}" step="${options.step || "any"}" ${options.min != null ? `min="${options.min}"` : ""}>`;
    return `<label><span>${esc(label)}</span><span class="input-unit">${input}<b>${esc(unit)}</b></span></label>`;
  }
  function renderTools() {
    $("#toolsView").innerHTML = `<div class="page-heading"><div><p class="eyebrow">Calculate, predict, then verify</p><h1>Engineering practice tools</h1><p>Each calculator shows equations, substitution, result and a sanity check. These are transparent learning screens—not project compliance engines.</p></div><span class="tag purple">Runs locally</span></div><div class="tools-grid">
      ${calculatorCard("powerCalc", "Three-phase P–Q–S and current", "Balanced sinusoidal screen using line-line voltage and total three-phase power.", field("Line-line voltage", "v", 11, "kV",{min:0})+field("Active power", "p", 8, "MW")+field("Power factor", "pf", .95, "",{min:0,step:.01})+field("Reactive direction", "sense", "", "",{select:[["lag","lagging / inductive"],["lead","leading / capacitive"]]}), "powerOutput")}
      ${calculatorCard("puCalc", "Per-unit bases", "Uses one three-phase MVA base and a line-line kV base.", field("Power base", "s", 100, "MVA",{min:0})+field("Voltage base", "v", 11, "kV",{min:0})+field("Actual impedance", "z", 1.21, "Ω",{min:0}), "puOutput")}
      ${calculatorCard("faultCalc", "Thevenin fault-current screen", "Balanced three-phase bolted-fault screen plus IEC peak-factor approximation from R/X.", field("Nominal voltage", "v", 33, "kV",{min:0})+field("Short-circuit level", "sk", 500, "MVA",{min:0})+field("X/R", "xr", 10, "",{min:0}), "faultOutput")}
      ${calculatorCard("dropCalc", "Radial voltage drop/rise screen", "Approximate balanced short-line result ΔV ≈ (RP + XQ)/V²; signs must follow the declared direction.", field("Line-line voltage", "v", 11, "kV",{min:0})+field("Active transfer", "p", 8, "MW")+field("Reactive transfer", "q", 2.63, "MVAr")+field("Total R", "r", .375, "Ω")+field("Total X", "x", .3, "Ω"), "dropOutput")}
      ${calculatorCard("idmtCalc", "IEC IDMT operating time", "Educational equation screen. Use the exact selected relay model/manual and project grading rule for settings.", field("Curve", "curve", "", "",{select:[["si","Standard inverse"],["vi","Very inverse"],["ei","Extremely inverse"],["lti","Long-time inverse"]]})+field("Pickup Is", "pickup", 100, "A",{min:0})+field("Fault current I", "fault", 1000, "A",{min:0})+field("TMS", "tms", .1, "",{min:0,step:.01}), "idmtOutput")}
      <article class="calculator-card" id="classifyCalc"><h2>G98 / G99 route screen</h2><p>Headline GB classification screen. It cannot resolve aggregation, PGM boundaries, hybrid/storage arrangements or DNO interpretation.</p><div class="calculator-fields">${field("Registered Capacity", "capacity", 20, "MW",{min:0})}${field("Connection voltage", "voltage", 33, "kV",{min:0})}<label class="check-field"><input name="g98" type="checkbox"><span>Fully type-tested micro-generator ≤16 A/phase at LV and all G98 eligibility conditions met</span></label></div><div class="calculator-output" id="classifyOutput"></div></article>
    </div><div class="source-banner"><strong>Engineering boundary:</strong> Hand screens are deliberately simple. Actual studies must use controlled network data, current standards, the connection agreement, manufacturer models/manuals and competent review.</div>`;
    bindCalculators();
  }
  function num(root, name) { return Number($(`[name="${name}"]`, root)?.value); }
  function fmt(value, digits = 3) { return Number.isFinite(value) ? Number(value).toLocaleString("en-GB", { maximumFractionDigits: digits }) : "—"; }
  function setCalc(id, html) { $(id).innerHTML = html; }
  function bindCalculators() {
    const power = $("#powerCalc"); const calcPower = () => { const v=num(power,"v"),p=num(power,"p"),pf=num(power,"pf"),sense=$("[name='sense']",power).value; if(!(v>0&&pf>0&&pf<=1)) return setCalc("#powerOutput","Use V > 0 and 0 < power factor ≤ 1."); const s=Math.abs(p)/pf,q=Math.abs(p)*Math.tan(Math.acos(pf))*(sense==="lead"?-1:1),i=s*1e6/(Math.sqrt(3)*v*1e3); setCalc("#powerOutput",`<strong>S = ${fmt(s)} MVA · Q = ${fmt(q)} MVAr · I = ${fmt(i,1)} A</strong><span>Substitution: |S| = |${fmt(p)}|/${fmt(pf)}; Q = |${fmt(p)}| tan(cos⁻¹ ${fmt(pf)}) with ${sense==="lead"?"negative":"positive"} Q; I = ${fmt(s)}×10⁶/(√3×${fmt(v)}×10³).</span><span>Sanity: P² + Q² = ${fmt(p*p+q*q)} and S² = ${fmt(s*s)} MVA².</span>`); };
    const pu=$("#puCalc"); const calcPu=()=>{const s=num(pu,"s"),v=num(pu,"v"),z=num(pu,"z");if(!(s>0&&v>0&&z>=0))return setCalc("#puOutput","Use positive bases and non-negative impedance.");const zb=v*v/s,ib=s*1e6/(Math.sqrt(3)*v*1e3),zpu=z/zb;setCalc("#puOutput",`<strong>Zbase = ${fmt(zb)} Ω · Ibase = ${fmt(ib,1)} A · Z = ${fmt(zpu)} pu</strong><span>Zbase = ${fmt(v)}²/${fmt(s)}. Ibase = ${fmt(s)}×10⁶/(√3×${fmt(v)}×10³). Zpu = ${fmt(z)}/${fmt(zb)}.</span><span>Sanity: ${fmt(zpu)} pu × ${fmt(zb)} Ω = ${fmt(z)} Ω.</span>`);};
    const fault=$("#faultCalc"); const calcFault=()=>{const v=num(fault,"v"),sk=num(fault,"sk"),xr=num(fault,"xr");if(!(v>0&&sk>0&&xr>0))return setCalc("#faultOutput","Use positive voltage, fault level and X/R.");const ik=sk/(Math.sqrt(3)*v),z=v*v/sk,r=z/Math.sqrt(1+xr*xr),x=xr*r,k=1.02+.98*Math.exp(-3/xr),ip=k*Math.sqrt(2)*ik;setCalc("#faultOutput",`<strong>Ik″ ≈ ${fmt(ik)} kA · |Zth| = ${fmt(z)} Ω · ip ≈ ${fmt(ip)} kA peak</strong><span>R ≈ ${fmt(r)} Ω, X ≈ ${fmt(x)} Ω. κ ≈ 1.02 + 0.98e^(−3R/X) = ${fmt(k)}; ip ≈ κ√2 Ik″.</span><span>Use only as a screen: IEC 60909 voltage/correction factors and actual network contributions govern a formal result.</span>`);};
    const drop=$("#dropCalc"); const calcDrop=()=>{const v=num(drop,"v"),p=num(drop,"p"),q=num(drop,"q"),r=num(drop,"r"),x=num(drop,"x");if(!(v>0))return setCalc("#dropOutput","Voltage must be positive.");const frac=(r*p+x*q)/(v*v),pct=100*frac;setCalc("#dropOutput",`<strong>Approximate ΔV = ${fmt(pct)}% (${pct>=0?"drop in the declared transfer direction":"rise in the declared transfer direction"})</strong><span>100 × (${fmt(r)}×${fmt(p)} + ${fmt(x)}×${fmt(q)})/${fmt(v)}².</span><span>Check signs, taps, shunt charging and voltage dependence in a full load flow.</span>`);};
    const idmt=$("#idmtCalc"); const calcIdmt=()=>{const constants={si:[.14,.02,"Standard inverse"],vi:[13.5,1,"Very inverse"],ei:[80,2,"Extremely inverse"],lti:[120,1,"Long-time inverse"]},curve=$("[name='curve']",idmt).value,pickup=num(idmt,"pickup"),faultI=num(idmt,"fault"),tms=num(idmt,"tms"),[k,a,label]=constants[curve],m=faultI/pickup;if(!(pickup>0&&faultI>0&&tms>=0&&m>1))return setCalc("#idmtOutput","I/Is must be greater than 1 for this operating-time equation.");const t=tms*k/(Math.pow(m,a)-1);setCalc("#idmtOutput",`<strong>${label}: t = ${fmt(t)} s at I/Is = ${fmt(m)}</strong><span>t = TMS × k / ((I/Is)^α − 1) = ${fmt(tms)}×${k}/(${fmt(m)}^${a}−1).</span>${idmtSvg(curve,tms,m)}<span>Add breaker time and the project uncertainty/grading allowance when checking total clearance.</span>`);};
    const classify=$("#classifyCalc"); const calcClassify=()=>{const c=num(classify,"capacity"),v=num(classify,"voltage"),g98=$("[name='g98']",classify).checked;let route;if(g98)route="Potential G98 route—verify every eligibility, aggregation, notification and DNO condition in current G98.";else if(v>=110||c>=50)route="Headline G99 Type D";else if(c>=10)route="Headline G99 Type C";else if(c>=1)route="Headline G99 Type B";else if(c>=.0008)route="Headline G99 Type A";else route="Below the 0.8 kW Type A lower threshold—verify the actual product/connection arrangement and current route.";setCalc("#classifyOutput",`<strong>${route}</strong><span>Basis entered: ${fmt(c,6)} MW Registered Capacity at ${fmt(v)} kV. Export limitation does not automatically reduce Registered Capacity or remove other studies.</span><span>Verify live G98/G99, PGM boundary, forms and host-DNO interpretation before use.</span>`);};
    [[power,calcPower],[pu,calcPu],[fault,calcFault],[drop,calcDrop],[idmt,calcIdmt],[classify,calcClassify]].forEach(([root,fn])=>{root.addEventListener("input",fn);root.addEventListener("change",fn);fn();});
  }
  function idmtSvg(curve,tms,marker) { const c={si:[.14,.02],vi:[13.5,1],ei:[80,2],lti:[120,1]}[curve]; const pts=[]; for(let x=1.1;x<=20;x+=.25){const t=tms*c[0]/(Math.pow(x,c[1])-1);const px=20+230*(Math.log10(x)-Math.log10(1.1))/(Math.log10(20)-Math.log10(1.1));const py=112-92*(Math.log10(Math.min(100,Math.max(.05,t)))-Math.log10(.05))/(Math.log10(100)-Math.log10(.05));pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);}const mx=20+230*(Math.log10(Math.min(20,Math.max(1.1,marker)))-Math.log10(1.1))/(Math.log10(20)-Math.log10(1.1));return `<svg class="idmt-plot" viewBox="0 0 270 140" role="img" aria-label="IDMT operating curve"><path d="M20 10V112H255"/><polyline points="${pts.join(" ")}"/><circle cx="${mx.toFixed(1)}" cy="${pts[Math.min(pts.length-1,Math.max(0,Math.round((Math.min(20,Math.max(1.1,marker))-1.1)/.25)))].split(",")[1]}" r="4"/><text x="210" y="132">I / Is</text><text x="3" y="15">t</text></svg>`; }

  function renderGlossary(letter = "all", query = "") {
    const q = query.trim().toLowerCase();
    const items = DATA.glossaryItems.filter(g => (letter === "all" || g.term[0].toLowerCase() === letter) && (!q || `${g.term} ${g.aliases} ${g.short} ${g.detail}`.toLowerCase().includes(q))).sort((a,b)=>a.term.localeCompare(b.term));
    const letters = [...new Set(DATA.glossaryItems.map(g => g.term[0].toLowerCase()))].sort();
    $("#glossaryView").innerHTML = `<div class="page-heading"><div><p class="eyebrow">Plain-English technical language</p><h1>Glossary</h1><p>${DATA.glossaryItems.length} essential terms. Hover, focus or tap marked terms inside chapters for quick definitions.</p></div></div>
      <div class="glossary-tools"><label class="sr-only" for="glossarySearch">Search glossary</label><input class="control" id="glossarySearch" type="search" value="${esc(query)}" placeholder="Search term or acronym…"></div>
      <div class="alpha-filter"><button class="${letter === "all" ? "is-active" : ""}" data-letter="all">All</button>${letters.map(l => `<button class="${letter === l ? "is-active" : ""}" data-letter="${l}">${l.toUpperCase()}</button>`).join("")}</div>
      <div class="glossary-grid">${items.length ? items.map(g => `<article class="glossary-item"><h2>${esc(g.term)}${g.unit ? ` <small>(${esc(g.unit)})</small>` : ""}</h2><p>${esc(g.short)} ${esc(g.detail)}</p>${g.aliases ? `<p><strong>Also:</strong> ${esc(g.aliases)}</p>` : ""}<button data-ask-term="${esc(g.term)}">Ask the tutor about this →</button></article>`).join("") : `<div class="empty-state">No matching term. Try an acronym or broader word.</div>`}</div>`;
    $("#glossarySearch").addEventListener("input", e => renderGlossary(letter, e.target.value));
    $$("[data-letter]", $("#glossaryView")).forEach(b => b.addEventListener("click", () => renderGlossary(b.dataset.letter, query)));
    $$("[data-ask-term]", $("#glossaryView")).forEach(b => b.addEventListener("click", () => openTutor(`Explain ${b.dataset.askTerm} in simple terms`)));
  }

  function renderSources(filter = "all") {
    const categories = [...new Set(DATA.sources.map(s => s.category))].sort();
    const list = filter === "all" ? DATA.sources : DATA.sources.filter(s => s.category === filter);
    $("#sourcesView").innerHTML = `<div class="page-heading"><div><p class="eyebrow">Authority before memory</p><h1>Source library</h1><p>Official registers and primary documents behind the book. Baseline checked ${esc(DATA.checked)}.</p></div></div>
      <div class="source-banner"><strong>Living requirements</strong><br>Grid codes, ENA recommendations, connection processes and DNO policies change. Open the live source, confirm status/issue/clause and record the check date on project evidence. Licensed IEC/BS standards must be accessed through an authorised copy.</div>
      <div class="filter-bar">${filterButton("all", "All sources", filter)}${categories.map(c => `<button class="filter-button ${filter === c ? "is-active" : ""}" data-source-filter="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <div class="source-grid">${list.map(s => `<article class="source-card"><div class="source-meta"><span>${esc(s.category)}</span><span>Checked ${esc(s.checked)}</span></div><h2>${esc(s.title)}</h2><p><strong>${esc(s.publisher)}</strong><br>${esc(s.edition)}</p><p>${esc(s.note)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Open official source ↗</a></article>`).join("")}</div>`;
    $$("[data-filter='all']", $("#sourcesView")).forEach(b => b.addEventListener("click", () => renderSources("all")));
    $$("[data-source-filter]", $("#sourcesView")).forEach(b => b.addEventListener("click", () => renderSources(b.dataset.sourceFilter)));
  }

  function renderCPD() {
    const total = state.cpd.reduce((a,e)=>a+Number(e.hours||0),0);
    $("#cpdView").innerHTML = `<div class="page-heading"><div><p class="eyebrow">Turn learning into evidence</p><h1>CPD evidence log</h1><p>Capture reflection and application, not attendance alone. This is your learner record—not automatic proof for an employer or professional body.</p></div><span class="tag purple">${total.toFixed(1)} recorded hours</span></div>
      <div class="cpd-grid"><section class="cpd-card"><h2>Add reflection</h2><form class="cpd-form" id="cpdForm">
        <label>Date<input name="date" type="date" required value="${new Date().toISOString().slice(0,10)}"></label>
        <label>Related chapter<select name="week"><option value="">General learning</option>${DATA.weeks.map(w=>`<option value="${w.n}">Chapter ${w.n}: ${esc(w.title)}</option>`).join("")}</select></label>
        <label>Activity / objective<input name="activity" required placeholder="e.g. IEC 60909 maximum/minimum study"></label>
        <label>Hours<input name="hours" type="number" min="0.25" max="40" step="0.25" required></label>
        <label>What did you learn?<textarea name="learned" rows="3" required></textarea></label>
        <label>How will you apply it / next action?<textarea name="apply" rows="3" required></textarea></label>
        <button class="primary-button" type="submit">Save reflection</button>
      </form></section>
      <section class="cpd-card"><div class="panel-head"><h2>Your log</h2><div><button class="text-button" id="exportCpd">Export CSV</button><button class="text-button" id="printCpd">Print</button></div></div>
        <div id="cpdEntries">${state.cpd.length ? state.cpd.map((e,i)=>`<article class="cpd-entry"><strong>${esc(e.activity)}</strong><small>${esc(e.date)} · ${Number(e.hours).toFixed(2)} h${e.week ? ` · Chapter ${e.week}` : ""}</small><p>${esc(e.learned)}</p><p><strong>Next:</strong> ${esc(e.apply)}</p><button class="text-button" data-delete-cpd="${i}">Delete</button></article>`).join("") : `<div class="empty-state"><p>No reflections yet. Complete a lab, then record what changed in your understanding.</p></div>`}</div>
      </section></div>`;
    $("#cpdForm").addEventListener("submit", e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); state.cpd.unshift(d); logActivity(`Logged ${d.hours} CPD hours: ${d.activity}`); saveState(); renderCPD(); showToast("CPD reflection saved locally."); });
    $$("[data-delete-cpd]", $("#cpdView")).forEach(b => b.addEventListener("click", () => { state.cpd.splice(Number(b.dataset.deleteCpd),1); saveState(); renderCPD(); }));
    $("#exportCpd").addEventListener("click", exportCPD);
    $("#printCpd").addEventListener("click", () => window.print());
  }
  function exportCPD() {
    const headers = ["date","week","activity","hours","learned","apply"];
    const safeCsv = value => { let s=String(value??""); if (/^[=+\-@]/.test(s)) s="'"+s; return `"${s.replace(/"/g,'""')}"`; };
    const csv = [headers.join(","), ...state.cpd.map(e => headers.map(h=>safeCsv(e[h])).join(","))].join("\r\n");
    const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="gridready-cpd.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  function bindTerms(root) {
    $$(".term", root).forEach(button => {
      button.addEventListener("mouseenter", () => openTermPopover(button));
      button.addEventListener("focus", () => openTermPopover(button));
      button.addEventListener("click", e => { e.stopPropagation(); openTermPopover(button, true); });
    });
  }
  function openTermPopover(trigger, moveFocus = false) {
    const item = DATA.glossaryMap[trigger.dataset.term.toLowerCase()]; if (!item) return;
    if (activeTermTrigger && activeTermTrigger !== trigger) activeTermTrigger.setAttribute("aria-expanded", "false");
    activeTermTrigger = trigger; trigger.setAttribute("aria-expanded", "true"); const pop = $("#termPopover");
    pop.innerHTML = `<div class="popover-head"><strong>${esc(item.term)}</strong><button type="button" data-popover-close aria-label="Close term explanation">×</button></div><p>${esc(item.short)} ${esc(item.detail)}</p>${item.aliases ? `<p><small>Also: ${esc(item.aliases)}</small></p>` : ""}<button type="button" data-popover-ask>Ask the tutor →</button>`;
    pop.hidden = false;
    const r = trigger.getBoundingClientRect(); const width = Math.min(320, window.innerWidth - 24); let left = Math.min(Math.max(12, r.left), window.innerWidth - width - 12); let top = r.bottom + 9;
    pop.style.width = `${width}px`; pop.style.left = `${left}px`; pop.style.top = `${top}px`;
    requestAnimationFrame(() => { const pr = pop.getBoundingClientRect(); if (pr.bottom > window.innerHeight - 10) pop.style.top = `${Math.max(10, r.top - pr.height - 9)}px`; });
    $("[data-popover-close]", pop).addEventListener("click", () => closeTermPopover(true));
    $("[data-popover-ask]", pop).addEventListener("click", () => { closeTermPopover(false); openTutor(`Explain ${item.term} and give me a simple example`); });
    if (moveFocus) $("[data-popover-close]", pop).focus();
  }
  function closeTermPopover(returnFocus = false) { const pop=$("#termPopover"); if (!pop.hidden) { pop.hidden=true; activeTermTrigger?.setAttribute("aria-expanded", "false"); if (returnFocus) activeTermTrigger?.focus(); } }

  function openTutor(prefill = "") {
    tutorReturnFocus = document.activeElement; const panel=$("#tutorPanel"); panel.inert=false; panel.classList.add("is-open"); panel.setAttribute("aria-hidden","false"); $("#overlay").hidden=false; updateTutorContext(); renderPromptChips(); renderTutorHistory();
    if (prefill) { $("#tutorInput").value=prefill; const generation=tutorGeneration; setTimeout(()=>{if(generation===tutorGeneration)submitTutorQuestion(prefill);},80); } else setTimeout(()=>$("#tutorInput").focus(),150);
  }
  function closeTutor() { const panel=$("#tutorPanel"); panel.classList.remove("is-open"); panel.setAttribute("aria-hidden","true"); panel.inert=true; $("#overlay").hidden=true; if (tutorReturnFocus?.isConnected) tutorReturnFocus.focus(); tutorReturnFocus=null; }
  function updateTutorContext() { const el=$("#tutorContext"); if (!el) return; const w=weekFor(currentWeek); const topic=state.tutor.lastTopic?` · Remembered topic: ${state.tutor.lastTopic}`:""; el.textContent = currentView === "lesson" ? `Current context: Chapter ${w.n} — ${w.title}${topic}` : `Book context: 32 chapters${topic}`; }
  function renderPromptChips() { const prompts=currentView==="lesson"?[`Teach Chapter ${currentWeek} step by step`,`Give me the worked example for Chapter ${currentWeek}`,`Show every PowerFactory step for Chapter ${currentWeek}`,`What can go wrong in Chapter ${currentWeek}?`]:["Teach me per-unit","G99 vs G100","Calculate current for 20 MVA at 11 kV","Why max/min fault levels?"]; $("#suggestedPrompts").innerHTML=prompts.map(p=>`<button type="button">${esc(p)}</button>`).join(""); $$("button",$("#suggestedPrompts")).forEach(b=>b.addEventListener("click",()=>submitTutorQuestion(b.textContent))); }
  const tutorStop = new Set("a an and are as at be because by can could did do does for from how i if in into is it me my of on or our should that the their then there these this to was what when where which why with would you your explain give show tell please about more step steps".split(" "));
  function normaliseTutor(text) { return String(text).toLowerCase().replace(/[′’]/g,"'").replace(/[″]/g,"''").replace(/p[–—-]q/g,"pq").replace(/per[–—-]unit/g,"per unit").replace(/x\s*\/\s*r/g,"x r").replace(/\bdigsilent\b/g,"powerfactory").replace(/\bmaximum\b/g,"max").replace(/\bminimum\b/g,"min").replace(/[^a-z0-9.'φ]+/g," ").trim(); }
  function tutorTokens(text) { return normaliseTutor(text).split(/\s+/).filter(t=>t.length>1&&!tutorStop.has(t)); }
  function buildTutorCorpus() {
    const docs=[]; const add=doc=>{const text=[doc.title,doc.aliases,doc.plain,doc.technical,doc.formula,doc.example,doc.warning,(doc.steps||[]).join(" "),(doc.mistakes||[]).join(" "),(doc.checks||[]).join(" ")].filter(Boolean).join(" ");docs.push({...doc,text,tokens:tutorTokens(text)});};
    DATA.glossaryItems.forEach(g=>add({id:`g-${g.term}`,kind:"glossary",title:g.term,plain:g.short,technical:g.detail,aliases:g.aliases,unit:g.unit}));
    DATA.tutorKnowledge.forEach((k,i)=>add({id:`k-${i}`,kind:"knowledge",title:k.title,plain:k.answer,technical:k.caveat||"",week:k.week,aliases:k.keys.join(" ")}));
    DATA.weeks.forEach(w=>{
      add({id:`w-${w.n}`,kind:"chapter",title:`Chapter ${w.n}: ${w.title}`,aliases:`Week ${w.n}`,plain:w.summary,technical:w.teacher?.mentalModel,week:w.n,mistakes:w.teacher?.mistakes,sourceIds:w.sources});
      if(w.mastery)add({id:`w-${w.n}-mastery`,kind:"mastery",title:`Chapter ${w.n} mastery: ${w.title}`,aliases:`Week ${w.n} ${w.mastery.definitions.join(" ")}`,plain:w.mastery.reading,technical:w.mastery.formulas.map(f=>`${f.title}: ${f.equation}. Symbols: ${f.symbols}. Applies: ${f.assumptions}. Trap: ${f.trap}`).join(" "),formula:w.mastery.formulas.map(f=>f.equation).join("; "),example:`${w.mastery.example.problem} ${w.mastery.example.steps.join(" ")} Answer: ${w.mastery.example.answer}. ${w.mastery.example.interpretation}`,week:w.n,sectionId:"mastery-pack",mistakes:w.teacher?.mistakes,sourceIds:w.sources});
      w.sections.forEach(s=>add({id:`w-${w.n}-${s.id}`,kind:"section",title:s.title,plain:s.paragraphs[0],technical:s.paragraphs.slice(1).join(" "),formula:s.formula,example:s.example,warning:s.warning,week:w.n,sectionId:s.id,sourceIds:w.sources}));
      add({id:`w-${w.n}-lab`,kind:"lab",title:`PowerFactory: ${w.lab.title}`,aliases:`Chapter ${w.n} Week ${w.n} ${w.title}`,plain:w.lab.aim,technical:[w.lab.recipe?`Study Case: ${w.lab.recipe.studyCase}. Objects/data: ${w.lab.recipe.objects}. Command: ${w.lab.recipe.command}. Retain: ${w.lab.recipe.outputs}. Hold point: ${w.lab.recipe.holdPoint}.`:"",w.lab.deliverable].filter(Boolean).join(" "),guided:w.lab.guidedSteps||[],steps:(w.lab.guidedSteps||[]).flatMap(s=>[s.action,`Why: ${s.why}`,`Expected: ${s.expected}`,`Troubleshooting: ${s.troubleshoot}`]),checks:w.lab.checks,mistakes:w.teacher?.mistakes,week:w.n,sectionId:"powerfactory-lab",sourceIds:w.sources});
    });
    const b=window.TEACHER_DATA.bootcamp;
    b.mathPrimer.forEach((f,i)=>add({id:`math-${i}`,kind:"foundation",title:f.title,plain:f.lesson,technical:f.derivation,example:f.example,checks:[f.check],view:"bootcamp"}));
    b.fundamentals.forEach((f,i)=>add({id:`foundation-${i}`,kind:"foundation",title:f.title,plain:f.idea,technical:f.check,formula:f.formula,example:f.example}));
    b.workflows.forEach((w,i)=>add({id:`pf-workflow-${i}`,kind:"lab",title:w.title,plain:"PowerFactory repeatable workflow",steps:w.steps,sectionId:"",view:"bootcamp"}));
    const df=new Map();let total=0;docs.forEach(d=>{total+=d.tokens.length;new Set(d.tokens).forEach(t=>df.set(t,(df.get(t)||0)+1));});
    tutorCorpus=docs;tutorStats={avgLength:Math.max(1,total/docs.length),docFreq:df};
  }
  function glossaryEntity(query) {
    const n=normaliseTutor(query); let best=null;
    DATA.glossaryItems.forEach(g=>[g.term,...g.aliases.split(",")].filter(Boolean).forEach(alias=>{const a=normaliseTutor(alias);if(a&&new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?=\\s|$)`).test(n)&&(!best||a.length>best.alias.length))best={item:g,alias:a};}));
    return best?.item||null;
  }
  function detectTutorIntent(q) { const n=normaliseTutor(q); return { compare:/\b(vs|versus|difference|compare)\b/.test(n), calculate:/\b(calculate|compute|work out|what current|how many amps)\b/.test(n), powerfactory:/powerfactory|in pf|software|click|model it/i.test(n), mistakes:/mistake|wrong|fail|failure modes|troubleshoot|not work|go wrong|error/.test(n), example:/example|worked|numbers|numerical/.test(n), formula:/formula|equation|symbols|units/.test(n), simplify:/simple|plain english|analogy|beginner/.test(n), why:/\bwhy\b|reason|matter|purpose/.test(n), teach:/teach|step by step|start from|prerequisite/.test(n) }; }
  function followupQuery(q) { const n=normaliseTutor(q); if(/this (week|chapter)/.test(n)&&currentView==="lesson")return `${q} Chapter ${currentWeek} ${weekFor(currentWeek).title}`; const tokenCount=tutorTokens(q).length; const pronoun=/\b(it|that|this|them|those)\b/.test(n); const follow=/^(why|how|give|show|worked|example|formula|equation|failure modes|mistakes|more|simpler|continue|powerfactory steps|what can go wrong|next)/.test(n); if((pronoun||(follow&&tokenCount<6))&&state.tutor.lastTopic){const last=state.tutor.lastDocs.map(id=>tutorCorpus.find(d=>d.id===id)?.title).filter(Boolean)[0];return `${q} ${state.tutor.lastTopic} ${last||""}`;} return q; }
  function rankTutor(query,intent) {
    const terms=tutorTokens(query);const unique=[...new Set(terms)];const N=tutorCorpus.length;
    return tutorCorpus.map(d=>{const freq=new Map();d.tokens.forEach(t=>freq.set(t,(freq.get(t)||0)+1));let score=0,covered=0;unique.forEach(t=>{const f=freq.get(t)||0;if(!f)return;covered++;const df=tutorStats.docFreq.get(t)||0;const idf=Math.log(1+(N-df+.5)/(df+.5));score+=idf*(f*2.2)/(f+1.2*(.25+.75*d.tokens.length/tutorStats.avgLength));});const title=normaliseTutor(d.title);unique.forEach(t=>{if(new RegExp(`(^| )${t}( |$)`).test(title))score+=1.8;});if(intent.powerfactory&&d.kind==="lab")score+=4;if(intent.example&&d.example)score+=3;if(intent.mistakes&&d.mistakes?.length)score+=3;if(currentView==="lesson"&&d.week===currentWeek)score+=.8;return{d,score,coverage:unique.length?covered/unique.length:0};}).sort((a,b)=>b.score-a.score);
  }
  function findCompareTerms(q) { const n=normaliseTutor(q).replace(/difference between/,"versus"); const divider=n.match(/\b(vs|versus|compared with|compare)\b/); const segments=divider?n.split(divider[0]).filter(Boolean).slice(0,2):[]; const findIn=text=>{let best=null;DATA.glossaryItems.forEach(g=>[g.term,...g.aliases.split(",")].filter(Boolean).forEach(alias=>{const a=normaliseTutor(alias);if(a&&new RegExp(`(^| )${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}( |$)`).test(text)&&(!best||a.length>best.alias.length))best={item:g,alias:a};}));return best?.item;}; if(segments.length===2){const ordered=segments.map(findIn);if(ordered.every(Boolean)&&ordered[0].term!==ordered[1].term)return ordered;} const hits=[];DATA.glossaryItems.forEach(g=>{const variants=[g.term,...g.aliases.split(",")].map(normaliseTutor).filter(Boolean);if(variants.some(a=>new RegExp(`(^| )${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}( |$)`).test(n)))hits.push(g);});return [...new Map(hits.map(g=>[g.term,g])).values()].slice(0,2); }
  function tutorCalculation(q) {
    const n=normaliseTutor(q); const mva=n.match(/([\d.]+)\s*mva/),kv=n.match(/([\d.]+)\s*kv/); const pending=state.tutor.pendingCalculation; const s=Number(mva?.[1]||pending?.s),v=Number(kv?.[1]);
    if((/current|amp|ka\b/.test(n)||pending?.type==="current")&&s>0&&v>0){state.tutor.pendingCalculation=null;const a=s*1e6/(Math.sqrt(3)*v*1e3);return{topic:"three-phase current",text:`Three-phase current from apparent power\n\nFormula: I = |S|/(√3 VLL).\n\nSubstitution: I = ${fmt(s)} × 10⁶ /(√3 × ${fmt(v)} × 10³) = ${fmt(a,1)} A = ${fmt(a/1000)} kA.\n\nAssumptions: balanced three-phase RMS quantities, total three-phase MVA and line-line kV. Sanity check: tens of MVA at 11 kV should be roughly one kiloampere.`,citations:[{label:"Open the three-phase calculator",view:"tools"},{label:"Week 2 — three-phase quantities",week:2,anchor:"power"}],docs:["w-2-mastery"]};}
    if(pending&&kv&&(!Number.isFinite(v)||v<=0)){return{topic:"three-phase current",text:"Please give a finite positive line-line voltage in kV, for example 11 kV or 33 kV.",citations:[],docs:["w-2-mastery"]};}
    if((/current|amp|ka\b/.test(n))&&s>0&&!kv){state.tutor.pendingCalculation={type:"current",s};return{topic:"three-phase current",text:`I have the apparent power (${fmt(s)} MVA). What line-line voltage in kV should I use?`,citations:[],docs:["w-2-mastery"]};}
    return null;
  }
  function composeTutorAnswer(q) {
    const rawNormal=normaliseTutor(q);const pendingContinuation=Boolean(state.tutor.pendingCalculation)&&/^\s*[\d.]+\s*kv\s*$/.test(rawNormal);if(state.tutor.pendingCalculation&&!pendingContinuation&&!/\b(current|amp|calculate|compute)\b/.test(rawNormal))state.tutor.pendingCalculation=null;
    const intent=detectTutorIntent(q);if(pendingContinuation)intent.calculate=true;const expanded=followupQuery(q);
    if(intent.calculate){const calc=tutorCalculation(expanded);if(calc)return calc;}
    if(intent.compare){const terms=findCompareTerms(expanded);if(terms.length===2){const citations=[{label:`Find ${terms[0].term} in the glossary`,view:"glossary",query:terms[0].term},{label:`Find ${terms[1].term} in the glossary`,view:"glossary",query:terms[1].term}];const needles=terms.map(t=>normaliseTutor(t.term));DATA.sources.filter(s=>needles.some(n=>normaliseTutor(s.title).includes(n))).slice(0,2).forEach(s=>citations.push({label:`Official source: ${s.title}`,url:s.url}));return{topic:`${terms[0].term} versus ${terms[1].term}`,text:`${terms[0].term} versus ${terms[1].term}\n\n${terms[0].term}: ${terms[0].short} ${terms[0].detail}\n\n${terms[1].term}: ${terms[1].short} ${terms[1].detail}\n\nKey distinction: compare their definitions, applicability threshold or boundary, required evidence and consequence. Use the controlling current document before assigning a project route or result.`,citations,docs:[`g-${terms[0].term}`,`g-${terms[1].term}`]};}}
    const explicitWeek=expanded.match(/(?:week|chapter)\s*(\d{1,2})/i);const targetWeek=explicitWeek?weekFor(Number(explicitWeek[1])):((/this (?:week|chapter)/i.test(q)&&currentView==="lesson")?weekFor(currentWeek):null);
    if(intent.teach&&targetWeek){const s=targetWeek.sections[0],t=targetWeek.teacher,first=(targetWeek.lab.guidedSteps||[]).slice(0,3);return{topic:`Chapter ${targetWeek.n}: ${targetWeek.title}`,text:`Chapter ${targetWeek.n} — ${targetWeek.title}\n\n1. Prerequisite: ${t.foundation}\n\n2. Mental model: ${t.mentalModel}\n\n3. First technical idea — ${s.title}: ${s.paragraphs[0]}${s.formula?`\n\n4. Equation: ${s.formula}`:""}${s.example?`\n\n5. Worked reasoning: ${s.example}`:""}\n\n6. First PowerFactory actions:\n${first.map((x,i)=>`${i+1}) ${x.action}\n   Why: ${x.why}\n   Expect: ${x.expected}`).join("\n")}\n\n7. Check yourself: explain the mental model without looking, define every symbol/unit and predict the direction of one changed input. I will retain this chapter when you ask for the example, formula, failure modes or full lab steps.`,citations:[{label:`Open Chapter ${targetWeek.n}`,week:targetWeek.n,anchor:"teacher-start"},{label:"Open its detailed runbook",week:targetWeek.n,anchor:"powerfactory-lab"}],docs:[`w-${targetWeek.n}-mastery`,`w-${targetWeek.n}-lab`]};}
    const ranked=rankTutor(expanded,intent);const top=ranked[0];const entity=glossaryEntity(expanded);const second=ranked[1];
    const rawTokens=tutorTokens(q); if(rawTokens.length===1&&new Set(["fault","protection","voltage","current","grid","model","code","settings"]).has(rawTokens[0])&&!entity){return{topic:state.tutor.lastTopic||"",text:`“${q.trim()}” is too broad for a technically reliable answer. Do you mean the definition, governing equation, PowerFactory workflow, protection application, or a UK connection requirement? Add the study purpose and boundary if this is project-specific.`,citations:[],docs:state.tutor.lastDocs};}
    if(!top||top.score<1.6||((top.coverage<.55)&&!entity)||(!entity&&rawTokens.length<=3&&second&&top.score<4&&top.score-second.score<0.35)){const nearby=ranked.filter(r=>r.score>0).slice(0,3);return{topic:state.tutor.lastTopic||"",text:`I don’t have a reliable local answer for that wording, so I won’t invent one.${nearby.length?`\n\nClosest course topics: ${nearby.map(r=>r.d.title).join("; ")}.`:""}\n\nGive me the exact term, result quantity, PowerFactory study, or UK document. For a project-specific requirement, include the connection voltage, capacity, technology and boundary.`,citations:[]};}
    let doc=top.d; if(entity&&!intent.teach&&!intent.example&&!intent.powerfactory&&!intent.formula){const exact=tutorCorpus.find(d=>d.kind==="glossary"&&d.title===entity.term);if(exact)doc=exact;} if(intent.teach){const rich=ranked.find(r=>r.d.formula||r.d.example);if(rich&&rich.score>1.5)doc=rich.d;if(entity&&doc.kind==="foundation")doc={...doc,technical:entity.detail};} if(intent.example){const rich=ranked.find(r=>r.d.example&&r.score>1.5);if(rich)doc=rich.d;} if(intent.formula){const rich=ranked.find(r=>r.d.formula&&r.score>1.5);if(rich)doc=rich.d;}
    if(intent.powerfactory){const explicitLab=explicitWeek?tutorCorpus.find(d=>d.id===`w-${Number(explicitWeek[1])}-lab`):null;const specificTokens=tutorTokens(expanded).filter(t=>!["powerfactory","software","week","chapter"].includes(t)&&!/^\d+$/.test(t));if(explicitLab)doc=explicitLab;else if(!specificTokens.length)return{topic:state.tutor.lastTopic||"",text:"I can give an exact PowerFactory procedure once the study is identified. Tell me the target—load flow, IEC/G74/Complete fault, protection, harmonics, RMS dynamics, G99 evidence, or the chapter number—plus the model boundary.",citations:[{label:"Open the PowerFactory lab manual",view:"bootcamp"}],docs:state.tutor.lastDocs};else{const labHit=ranked.find(r=>r.d.kind==="lab"&&r.score>=1.6&&r.coverage>=0.25);if(labHit)doc=labHit.d;else return{topic:state.tutor.lastTopic||"",text:"I can give an exact PowerFactory procedure once the study is identified. Tell me the target—load flow, IEC/G74/Complete fault, protection, harmonics, RMS dynamics, G99 evidence, or the chapter number—plus the model boundary.",citations:[{label:"Open the PowerFactory lab manual",view:"bootcamp"}],docs:state.tutor.lastDocs};}}
    const depth=state.tutor.depth;let body="";
    if(intent.teach){const hintedWeek=entity?DATA.tutorKnowledge.find(k=>k.keys.some(key=>normaliseTutor(key)===normaliseTutor(entity.term)))?.week:null;const relatedLab=(hintedWeek?tutorCorpus.find(d=>d.id===`w-${hintedWeek}-lab`):null)||ranked.find(r=>r.d.kind==="lab"&&r.d.week)?.d;body=`Teach me: ${doc.title}\n\n1. Prerequisite\nBe comfortable with the units and simpler quantities used below. If any symbol is unfamiliar, ask for its definition first.\n\n2. Plain-language mental model\n${doc.plain}\n\n3. Technical mechanism\n${doc.technical||"The book builds this from controlled inputs, a physical model, a calculation and an independent check."}\n\n4. Equation and assumptions\n${doc.formula||"This topic is primarily procedural; make each input, boundary, method and acceptance criterion explicit."}\n\n5. Worked example\n${doc.example||"Use the linked chapter’s authored example, then change one value and predict the direction before recalculating."}${relatedLab?`\n\n6. Apply it in PowerFactory\n${relatedLab.guided?.slice(0,2).map((s,i)=>`${i+1}) ${s.action}\n   Why: ${s.why}\n   Expect: ${s.expected}`).join("\n")||relatedLab.plain}`:"\n\n6. Apply it\nUse the linked chapter’s controlled practice and save an independent check."}\n\n7. Retrieval check\nExplain the cause-and-effect story in your own words, define every symbol/unit, then predict what happens if one input increases. Ask “simpler”, “worked example”, “PowerFactory steps”, or “what can go wrong?” and I will keep this topic.`;}
    else if(intent.powerfactory&&doc.steps?.length){const procedure=doc.guided?.length?doc.guided.map((s,i)=>`${i+1}. ${s.action}\n   Why: ${s.why}\n   Expect: ${s.expected}\n   If it fails: ${s.troubleshoot}`).join("\n\n"):doc.steps.slice(0,depth==="deep"?18:depth==="engineer"?10:6).map((s,i)=>`${i+1}. ${s}`).join("\n");body=`${doc.title}\n\n${doc.plain||"Follow this controlled workflow."}\n\nExecution basis\n${doc.technical||"Use a dedicated Study Case, controlled objects/data, the documented calculation command and a retained result check."}\n\n${procedure}\n\nDo not continue past an unexplained warning. Save the active Study Case, scenario/variation, method options, calculation status and one independent check.`;}
    else if(intent.mistakes){body=`${doc.title} — what can go wrong\n\n${doc.plain||doc.technical}\n\nCommon failure modes:\n${(doc.mistakes||[]).slice(0,6).map(m=>`• ${m}`).join("\n")||"• Wrong active case or topology\n• Unit/base/sign mismatch\n• Accepting convergence without a physical check"}`;}
    else if(intent.example&&doc.example){body=`${doc.title} — worked example\n\n${doc.example}${doc.formula?`\n\nEquation: ${doc.formula}`:""}\n\nNow change one input, predict the direction first, and recalculate.`;}
    else if(intent.formula){body=`${doc.title} — formula and symbols\n\n${doc.formula||"This is a procedural topic without one governing scalar equation."}${doc.unit?`\n\nDeclared unit: ${doc.unit}`:""}${doc.technical?`\n\nSymbols, units, assumptions and traps\n${doc.technical}`:""}\n\nApplication boundary: ${doc.plain}\n\nIf a criterion is project-specific, copy it from the controlled source rather than memory.`;}
    else if(intent.simplify){body=`${doc.title}, in plain English\n\n${doc.plain}\n\nMental picture: focus on what goes in, what the network or protection changes, and what measurable result comes out. Then use the technical detail only after that cause-and-effect story is clear.`;}
    else if(intent.why){body=`${doc.title} — why it matters\n\n${doc.plain}\n\nEngineering reason: ${doc.technical||"it changes whether the model result is physically valid and whether the stated decision can be defended."}${doc.example?`\n\nConcrete example: ${doc.example}`:""}`;}
    else {body=`${doc.title}\n\n${doc.plain}${doc.technical?`\n\n${depth==="learner"?"What that means in practice":"Technical detail"}: ${doc.technical}`:""}${depth==="deep"&&doc.formula?`\n\nEquation: ${doc.formula}`:""}${doc.example?`\n\nExample: ${doc.example}`:""}`;}
    const citations=[];if(doc.week)citations.push({label:`Book evidence: Chapter ${doc.week} — ${weekFor(doc.week).title}`,week:doc.week,anchor:doc.sectionId||"teacher-start"});if(doc.view)citations.push({label:"Open PowerFactory lab manual",view:doc.view});if(doc.kind==="glossary")citations.push({label:`Open ${doc.title} in glossary`,view:"glossary",query:doc.title});(doc.sourceIds||[]).map(sourceFor).filter(Boolean).slice(0,2).forEach(s=>citations.push({label:`Official source: ${s.title}`,url:s.url}));
    return{topic:entity?.term||doc.title.replace(/^(?:Week|Chapter) \d+: /,""),text:body,citations,docs:ranked.slice(0,3).map(r=>r.d.id)};
  }
  function submitTutorQuestion(question) {
    const q=question.trim(); if(!q)return; addTutorMessage(q,"user"); $("#tutorInput").value="";
    const answer=composeTutorAnswer(q);state.tutor.lastTopic=answer.topic||state.tutor.lastTopic;state.tutor.lastDocs=answer.docs||state.tutor.lastDocs;state.tutor.lastIntent=Object.entries(detectTutorIntent(q)).find(([,v])=>v)?.[0]||"explain";updateTutorContext();const generation=tutorGeneration;setTimeout(()=>{if(generation===tutorGeneration)addTutorMessage(answer.text,"assistant",answer.citations);},120);
  }
  function addTutorMessage(text, role, citations=[]) { const message={text,role,citations,at:new Date().toISOString()};state.tutor.messages.push(message);state.tutor.messages=state.tutor.messages.slice(-40);saveState();appendTutorMessage(message); }
  function appendTutorMessage(message) { const box=$("#tutorMessages");const div=document.createElement("div");div.className=`message ${message.role}`;const body=document.createElement("div");body.textContent=message.text;div.appendChild(body);if(message.citations?.length){const links=document.createElement("div");links.className="tutor-citations";message.citations.forEach(c=>{const b=document.createElement("button");b.type="button";b.textContent=c.label;b.addEventListener("click",()=>{if(c.url)window.open(c.url,"_blank","noopener");else if(c.week)openWeek(c.week,c.anchor||"");else if(c.view==="glossary"){renderGlossary("all",c.query||"");showView("glossary");}else if(c.view)navigate(c.view);if(!c.url)closeTutor();});links.appendChild(b);});div.appendChild(links);}box.appendChild(div);box.scrollTop=box.scrollHeight;}
  function renderTutorHistory(){const box=$("#tutorMessages");box.innerHTML="";const history=state.tutor.messages.length?state.tutor.messages:[{role:"assistant",text:welcomeMessage,citations:[]}];history.forEach(appendTutorMessage);}
  function clearTutor(){tutorGeneration++;state.tutor={...structuredClone(defaultState.tutor),depth:state.tutor.depth};saveState();renderTutorHistory();updateTutorContext();showToast("Tutor conversation cleared.");}

  function runSearch(query) {
    const q=query.trim().toLowerCase(); const box=$("#searchResults");
    if(q.length<2){box.hidden=true;return;}
    const results=[];
    DATA.weeks.forEach(w=>{const hay=`${w.title} ${w.summary} ${w.outcomes.join(" ")} ${w.sections.map(s=>`${s.title} ${s.paragraphs.join(" ")}`).join(" ")} ${w.teacher?.mentalModel||""} ${(w.teacher?.mistakes||[]).join(" ")} ${(w.lab.guidedSteps||[]).map(s=>`${s.action} ${s.why} ${s.expected} ${s.troubleshoot}`).join(" ")}`.toLowerCase(); if(hay.includes(q))results.push({type:"Chapter",title:`Chapter ${w.n}: ${w.title}`,note:w.summary,action:()=>openWeek(w.n)});});
    DATA.glossaryItems.forEach(g=>{const hay=`${g.term} ${g.aliases} ${g.short} ${g.detail}`.toLowerCase();if(hay.includes(q))results.push({type:"Glossary",title:g.term,note:g.short,action:()=>{renderGlossary("all",g.term);showView("glossary");}});});
    DATA.sources.forEach(s=>{if(`${s.title} ${s.publisher} ${s.edition} ${s.note}`.toLowerCase().includes(q))results.push({type:"Source",title:s.title,note:`${s.publisher} · ${s.edition}`,action:()=>{renderSources(s.category);showView("sources");}});});
    const bootHay=window.TEACHER_DATA.bootcamp.fundamentals.map(f=>`${f.title} ${f.idea} ${f.formula} ${f.example}`).join(" ").toLowerCase();if(bootHay.includes(q)||"powerfactory tutorial mini-3b study case operation scenario variation".includes(q))results.push({type:"Teacher lab",title:"PowerFactory teacher lab",note:"Electrical foundations, object hierarchy and the 16-step Mini-3B build",action:()=>navigate("bootcamp")});
    if("calculator current per-unit fault idmt voltage drop g99 classification engineering tools".includes(q))results.push({type:"Interactive",title:"Engineering practice tools",note:"Transparent calculators with substitutions and sanity checks",action:()=>navigate("tools")});
    box.innerHTML=results.length?results.slice(0,10).map((r,i)=>`<button class="search-result" data-result="${i}"><strong>${esc(r.title)}</strong><small>${esc(r.type)} · ${esc(r.note).slice(0,120)}</small></button>`).join(""):`<div class="empty-state"><p>No exact match. Try an acronym or broader term.</p></div>`;
    box.hidden=false; $$("[data-result]",box).forEach(b=>b.addEventListener("click",()=>{results[Number(b.dataset.result)].action();$("#globalSearch").value="";}));
  }
  function closeSearch(){$("#searchResults").hidden=true;}
  function bindCommon(root){$$('[data-go]',root).forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));$$('[data-open-week]',root).forEach(b=>b.addEventListener('click',()=>openWeek(b.dataset.openWeek)));}
  function navigate(name){ if(name==="dashboard")renderDashboard(); if(name==="curriculum")renderCurriculum(); if(name==="bootcamp")renderBootcamp(); if(name==="tools")renderTools(); if(name==="glossary")renderGlossary(); if(name==="sources")renderSources(); if(name==="cpd")renderCPD(); showView(name); history.replaceState(null,"",`#${name}`); const titles={dashboard:"Book home",curriculum:"Chapters",bootcamp:"PowerFactory lab manual",tools:"Engineering tools",glossary:"Glossary",sources:"Source library",cpd:"CPD evidence"};document.title=`${titles[name]||"GridReady UK"} — GridReady UK`;requestAnimationFrame(()=>{const heading=$(`[data-view-panel="${name}"] h1`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}); }
  function formatDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?"":new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(d);}
  function closeMobileMenu(){ $("#sidebar").classList.remove("is-open"); $("#menuButton").setAttribute("aria-expanded","false"); if(!$("#tutorPanel").classList.contains("is-open"))$("#overlay").hidden=true; }

  function init(){
    document.documentElement.dataset.theme=state.theme; buildTutorCorpus(); updateProgressUI(); renderDashboard(); renderCurriculum(); renderBootcamp(); renderTools(); renderGlossary(); renderSources(); renderCPD(); renderTutorHistory();
    $$(".nav-item").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
    $("#globalSearch").addEventListener("input",e=>runSearch(e.target.value)); $("#globalSearch").addEventListener("keydown",e=>{if(e.key==="Escape"){closeSearch();e.target.blur();}});
    $("#themeToggle").addEventListener("click",()=>{state.theme=state.theme==="light"?"dark":"light";document.documentElement.dataset.theme=state.theme;saveState();});
    $("#bookmarkButton").addEventListener("click",()=>{renderCurriculum("bookmarks");showView("curriculum");});
    $("#tutorLaunch").addEventListener("click",()=>openTutor()); $("#tutorClose").addEventListener("click",closeTutor); $("#tutorClear").addEventListener("click",clearTutor); $("#tutorDepth").value=state.tutor.depth; $("#tutorDepth").addEventListener("change",e=>{state.tutor.depth=e.target.value;saveState();showToast(`Tutor depth: ${e.target.options[e.target.selectedIndex].text}`);}); $("#overlay").addEventListener("click",()=>{$("#sidebar").classList.remove("is-open");closeTutor();});
    $("#tutorForm").addEventListener("submit",e=>{e.preventDefault();submitTutorQuestion($("#tutorInput").value);});
    $("#menuButton").addEventListener("click",()=>{const open=$("#sidebar").classList.toggle("is-open");$("#menuButton").setAttribute("aria-expanded",String(open));$("#overlay").hidden=!open;});
    document.addEventListener("click",e=>{if(!e.target.closest(".popover")&&!e.target.closest(".term"))closeTermPopover();if(!e.target.closest(".search-wrap"))closeSearch();});
    document.addEventListener("keydown",e=>{
      if(e.key==="/"&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();$("#globalSearch").focus();}
      if(e.key==="Tab"&&$("#tutorPanel").classList.contains("is-open")){
        const focusable=$$("button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]",$("#tutorPanel")).filter(el=>el.offsetParent!==null);
        if(focusable.length){const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
      }
      if(e.key==="Escape"){closeTermPopover(true);if($("#tutorPanel").classList.contains("is-open"))closeTutor();}
    });
    window.addEventListener("scroll",()=>closeTermPopover(),{passive:true}); window.addEventListener("resize",()=>closeTermPopover());
    const hash=location.hash.replace("#",""); if(hash.startsWith("chapter-")||hash.startsWith("week-")){const parts=hash.split("/");openWeek(Number(parts[0].replace(/^(chapter-|week-)/,"")),parts[1]||"");} else if(["curriculum","bootcamp","tools","glossary","sources","cpd"].includes(hash))navigate(hash); else showView("dashboard");
  }
  if (window.__GRIDREADY_TEST_MODE__) {
    window.__GRIDREADY_TEST__ = {
      initialiseTutor: () => buildTutorCorpus(),
      ask: q => { const answer=composeTutorAnswer(String(q)); state.tutor.lastTopic=answer.topic||state.tutor.lastTopic; state.tutor.lastDocs=answer.docs||state.tutor.lastDocs; return answer; },
      resetTutor: () => { state.tutor=structuredClone(defaultState.tutor); },
      setContext: (view, week=1) => { currentView=view; currentWeek=week; },
      state: () => structuredClone(state.tutor)
    };
  } else init();
})();
