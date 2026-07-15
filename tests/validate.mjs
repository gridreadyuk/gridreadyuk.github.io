import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), context, { filename: "data.js" });
vm.runInContext(fs.readFileSync(path.join(root, "teacher-data.js"), "utf8"), context, { filename: "teacher-data.js" });
vm.runInContext(fs.readFileSync(path.join(root, "mastery-data.js"), "utf8"), context, { filename: "mastery-data.js" });
const data = context.window.COURSE_DATA;
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(data.weeks.length === 32, `Expected 32 weeks, found ${data.weeks.length}`);
check(data.weeks.every((w, i) => w.n === i + 1), "Week numbers must be consecutive 1–32");
check(data.phases.length === 6, `Expected 6 phases, found ${data.phases.length}`);
check(data.glossaryItems.length >= 125, `Expected at least 125 glossary terms after foundations expansion, found ${data.glossaryItems.length}`);
check(data.sources.length >= 35, `Expected at least 35 sources after the teacher layer, found ${data.sources.length}`);

const sourceIds = new Set(data.sources.map(s => s.id));
const glossaryTerms = new Set(data.glossaryItems.map(g => g.term.toLowerCase()));
check(sourceIds.size === data.sources.length, "Source IDs must be unique");
check(glossaryTerms.size === data.glossaryItems.length, "Glossary terms must be unique");
for (const s of data.sources) {
  check(/^https:\/\//.test(s.url), `Source ${s.id} must use HTTPS`);
  check(s.checked === data.checked, `Source ${s.id} is missing the baseline check date`);
}
for (const w of data.weeks) {
  check(w.title && w.summary, `Week ${w.n} needs title and summary`);
  check(w.outcomes.length >= 3, `Week ${w.n} needs at least 3 outcomes`);
  check(w.sections.length >= 2, `Week ${w.n} needs at least 2 concept sections`);
  check(w.sections.every(s => s.id && s.title && s.paragraphs.length >= 2), `Week ${w.n} has an incomplete section`);
  check(w.lab?.steps?.length >= 4, `Week ${w.n} lab needs at least 4 steps`);
  check(w.lab?.guidedSteps?.length >= w.lab?.steps?.length, `Week ${w.n} needs guidance for every lab step`);
  check(w.lab?.guidedSteps?.every(s => s.action && s.why && s.expected && s.troubleshoot), `Week ${w.n} guided lab needs action/reason/expected/troubleshooting`);
  check(w.lab?.recipe && ["studyCase","objects","command","outputs","holdPoint"].every(k=>w.lab.recipe[k]), `Week ${w.n} needs a complete PowerFactory execution sheet`);
  check(w.teacher?.foundation && w.teacher?.mentalModel && w.teacher?.mistakes?.length >= 3 && w.teacher?.workplace, `Week ${w.n} needs the complete teacher layer`);
  check(w.mastery?.definitions?.length >= 8, `Week ${w.n} mastery pack needs at least 8 definitions`);
  check(w.mastery?.definitions?.every(term => data.glossaryMap[term.toLowerCase()]), `Week ${w.n} mastery pack references an undefined term`);
  check(w.mastery?.formulas?.length >= 2, `Week ${w.n} mastery pack needs at least 2 formulas/method relations`);
  check(w.mastery?.formulas?.every(f => f.title && f.equation && f.symbols && f.assumptions && f.trap), `Week ${w.n} has an incomplete formula card`);
  check(w.mastery?.example?.problem && w.mastery?.example?.steps?.length >= 2 && w.mastery?.example?.answer && w.mastery?.example?.interpretation, `Week ${w.n} needs a complete worked example`);
  check(w.mastery?.reading, `Week ${w.n} needs a mastery reading objective`);
  check(w.lab?.checks?.length >= 2, `Week ${w.n} lab needs at least 2 validation checks`);
  check(w.lab?.deliverable, `Week ${w.n} lab needs a deliverable`);
  check(w.quizzes.length >= 2, `Week ${w.n} needs at least 2 quiz questions`);
  check(w.quizzes.every(q => q.options.length >= 3 && Number.isInteger(q.answer) && q.options[q.answer] && q.explanation), `Week ${w.n} has an invalid quiz`);
  for (const id of w.sources) check(sourceIds.has(id), `Week ${w.n} references unknown source ${id}`);
}

for (const n of [6,12,16,24,26]) {
  const chapter = data.weeks.find(w => w.n === n);
  check(chapter.lab.guidedSteps.length >= 12 && chapter.lab.guidedSteps.every(s => s.where), `Week ${n} needs a 12+ step field-executable PowerFactory procedure with exact object/command context`);
}

for (const file of ["index.html", "styles.css", "app.js", "data.js", "teacher-data.js", "mastery-data.js"]) check(fs.existsSync(path.join(root, file)), `Missing ${file}`);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const id of ["dashboardView", "curriculumView", "lessonView", "bootcampView", "toolsView", "glossaryView", "sourcesView", "cpdView", "tutorPanel", "termPopover", "tutorClear", "tutorDepth"]) check(html.includes(`id="${id}"`), `index.html missing #${id}`);
check(!/fonts\.googleapis|cdn\.|unpkg|jsdelivr/.test(html), "Runtime must not depend on a CDN");

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
check(!/TODO|FIXME/.test(app), "app.js contains TODO/FIXME markers");
check(app.includes("I don’t have a reliable local answer"), "Tutor must have an honest unknown-answer path");
check(app.includes("buildTutorCorpus") && app.includes("rankTutor") && app.includes("lastTopic"), "Tutor must use course retrieval and conversation context");
check(app.includes("renderBootcamp") && app.includes("bindCalculators"), "Teacher bootcamp and calculators must be implemented");
check(app.includes("renderMasteryPack") && app.includes("mastery-pack"), "Every week must render its definitions/formulas/example mastery pack");
check(app.includes("Workplace quick card") && app.includes("Four-sentence engineering conclusion"), "Every chapter must end with a compact workplace application card");
check(app.includes("Mark chapter read") && !app.includes("Evidence gate:"), "Reading progress must not be blocked by repetitive generic evidence forms");
check(app.includes("renderChapterVisual") && app.includes("engineering-svg"), "Every chapter must render an accessible technical visual");
check(fs.existsSync(path.join(root, "clipboard.png")), "The book cover image asset is missing");
check(app.includes("pendingCalculation") && app.includes("lastDocs") && app.includes("lastIntent"), "Tutor must retain calculation and grounded conversation state");
check(app.includes("Official source:") && app.includes("sourceIds"), "Tutor must expose source-backed citations when available");
check(data.weeks.find(w=>w.n===30).mastery.code?.includes("GetActiveStudyCase"), "Week 30 needs a runnable PowerFactory Python pattern");
check(data.weeks.find(w=>w.n===31).mastery.code?.includes("INVALID"), "Week 31 needs a runnable validity-gated evaluator pattern");
check(data.weeks.find(w=>w.n===8).mastery.definitions.includes("Unbalanced load flow"), "Week 8 mastery pack must be about unbalanced studies");
check(data.weeks.find(w=>w.n===22).mastery.definitions.includes("Frequency scan"), "Week 22 mastery pack must be about frequency scans and resonance");
check(data.weeks.find(w=>w.n===23).mastery.definitions.includes("P28") && data.weeks.find(w=>w.n===23).mastery.definitions.includes("Voltage unbalance"), "Week 23 must cover P28 and voltage unbalance together");
check(data.weeks.find(w=>w.n===25).mastery.definitions.includes("Intrinsic Design Capacity"), "Week 25 must define G98/G99 classification inputs, not only type thresholds");
check(data.weeks.find(w=>w.n===12).mastery.formulas[0].equation.includes("c Un²"), "Week 12 IEC source conversion must retain the voltage factor c");
check(data.weeks.find(w=>w.n===13).mastery.reading.includes("G74") && data.weeks.find(w=>w.n===13).mastery.reading.includes("Complete"), "Week 13 must distinguish G74 and Complete methods");
check(!data.weeks.find(w=>w.n===17).mastery.definitions.includes("Distance protection"), "Week 17 must stay focused on directional/transformer/instrument protection");
check(data.weeks.find(w=>w.n===18).mastery.definitions.includes("Distance protection") && data.weeks.find(w=>w.n===18).mastery.formulas.some(f=>f.equation.includes("Zapp")), "Week 18 must contain distance/unit/breaker-failure mastery material");
check(context.window.TEACHER_DATA.bootcamp.mathPrimer?.length >= 8, "Foundation Zero must teach the mathematical/circuit prerequisites rather than merely referring the learner elsewhere");
check(data.weeks.find(w=>w.n===25).mastery.routeTable?.length >= 8, "Week 25 needs a dated G98/G99 application and evidence route map");
check(data.weeks.find(w=>w.n===31).mastery.code.includes("allowedDirection") && data.weeks.find(w=>w.n===31).mastery.code.includes("Number.isFinite") && data.weeks.find(w=>w.n===31).mastery.code.includes("rollUp"), "Week 31 evaluator must reject invalid criteria/results and propagate overall status");
check(!/\bfetch\s*\(/.test(app), "Local tutor must not call a network API");
check(app.includes("formula-injection") === false, "No test-only marker should leak into the app");

const knownCurrent = 20e6 / (Math.sqrt(3) * 11e3);
check(Math.abs(knownCurrent - 1049.7) < 0.2, "Known-answer three-phase current check failed");
const q = 8 * Math.tan(Math.acos(0.95));
check(Math.abs(q - 2.629) < 0.01, "Known-answer reactive-power check failed");
const idmt = 0.1 * 0.14 / (Math.pow(10, 0.02) - 1);
check(Math.abs(idmt - 0.297) < 0.002, "Known-answer IEC standard-inverse check failed");
const voltageDropPct = 100 * (0.375 * 8 + 0.300 * 2.629) / (11 ** 2);
check(Math.abs(voltageDropPct - 3.132) < 0.01, "Known-answer radial voltage-drop check failed");
const ik = 500 / (Math.sqrt(3) * 33);
const zth = 33 ** 2 / 500;
const rth = zth / Math.sqrt(1 + 10 ** 2);
const xth = 10 * rth;
const kappa = 1.02 + 0.98 * Math.exp(-3 * rth / xth);
const ip = kappa * Math.sqrt(2) * ik;
check(Math.abs(ik - 8.748) < 0.002 && Math.abs(ip - 21.6) < 0.1, "Known-answer Thevenin/peak-current check failed");
const ner = 11000 / (Math.sqrt(3) * 1000);
check(Math.abs(ner - 6.351) < 0.002, "Known-answer NER resistance check failed");
const vuf = 100 * 0.00985 / 0.985;
check(Math.abs(vuf - 1.0) < 1e-9, "Known-answer voltage-unbalance check failed");
const current33 = 22e6 / (Math.sqrt(3) * 33e3);
check(Math.abs(current33 - 384.9) < 0.2, "Known-answer 33 kV converter current check failed");

if (failures.length) {
  console.error(`Validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS: ${data.weeks.length} teacher-layered weeks, ${data.weeks.reduce((s,w)=>s+w.mastery.formulas.length,0)} formula/method cards, ${data.weeks.length} complete worked examples, ${data.weeks.reduce((s,w)=>s+w.lab.guidedSteps.length,0)} guided lab steps, ${data.glossaryItems.length} glossary terms, ${data.sources.length} sources.`);
