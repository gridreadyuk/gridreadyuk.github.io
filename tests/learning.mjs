import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const context = { window: {} };
vm.createContext(context);
for (const file of ["data.js", "teacher-data.js", "mastery-data.js", "learning-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const data = context.window.COURSE_DATA;
const learn = context.window.LEARNING_DATA;
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(learn.version && learn.profiles.length === 6 && learn.objectives.length === 8, "Start Here needs six learner profiles and eight objectives");
check(learn.paths.length === 8 && new Set(learn.paths.map(pathItem => pathItem.id)).size === 8, "Eight unique advisory learning paths are required");
for (const pathItem of learn.paths) {
  check(pathItem.chapters.length && pathItem.chapters.every(n => data.weeks.some(w => w.n === n)), `Path ${pathItem.id} references an invalid chapter`);
  check(pathItem.prerequisite && pathItem.outcome && pathItem.standard && pathItem.portfolio.length && pathItem.labs.length && pathItem.assessments.length, `Path ${pathItem.id} is incomplete`);
}
check(learn.diagnostic.length === 6 && learn.diagnostic.every(q => q.options.length >= 4 && Number.isInteger(q.answer) && q.options[q.answer] && q.tags.length), "Diagnostic questions must be complete and scored");
check(learn.project.assets.length >= 8 && learn.project.scenarios.length >= 8 && Object.keys(learn.project.chapterLinks).length === 6, "Continuing training project needs assets, scenarios and chapter links");
check(learn.capstone.deliverables.length === 25 && learn.capstone.milestones.length === 6 && learn.capstone.rubric.length >= 5, "Capstone must have 25 deliverables, milestones and a rubric");
check(learn.clinic.length >= 10 && learn.clinic.every(c => c.symptom && c.check && c.risk), "Study clinic cases need a symptom, diagnostic sequence and risk");
check(learn.templates.length >= 12 && learn.templates.every(t => t.fields.length >= 4 && ["csv", "md"].includes(t.format)), "Open-format engineering templates are incomplete");

check(data.sources.every(s => s.classification && s.status && s.access && s.applicability && s.published), "Every source needs controlled metadata");
check(data.sources.find(s => s.id === "g99")?.classification === "Engineering recommendation", "G99 must be classified as an engineering recommendation");
check(data.sources.find(s => s.id === "p2")?.applicability.includes("not a universal N-1"), "P2 must not be taught as a generic N-1 requirement");
check(data.sources.find(s => s.id === "iec60909")?.access === "Licensed", "Licensed standards must be marked as such");

for (const id of ["startView", "pathsView", "projectView", "capstoneView"]) check(html.includes(`id="${id}"`), `index is missing ${id}`);
check(html.includes("learning-layer.js"), "Learning data must load before app.js");
for (const term of ["schema: 2", "exportProgress", "previewProgressImport", "resetProgress", "renderStart", "renderPaths", "renderProject", "renderCapstone"]) check(app.includes(term), `App is missing ${term}`);
check(app.includes("all chapters open") || app.includes("All material remains open"), "Learning paths must not lock content");

if (failures.length) {
  console.error(`Learning-environment validation failed (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS: ${learn.paths.length} advisory paths, diagnostic, continuing project, ${learn.capstone.deliverables.length}-deliverable capstone, clinic, templates, state portability and source governance.`);
