import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const context = { window: {} };
vm.createContext(context);
for (const file of ["data.js", "teacher-data.js", "mastery-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const data = context.window.COURSE_DATA;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(data.weeks.length === 32, "The book must expose 32 sequential technical chapters");
check(data.weeks.every((chapter, index) => chapter.n === index + 1), "Chapter numbering must be consecutive");
check(data.weeks.every(chapter => chapter.teacher?.mentalModel && chapter.mastery?.example && chapter.lab?.recipe), "Every chapter needs intuition, a worked example and a PowerFactory execution basis");
check(data.weeks.every(chapter => chapter.lab.guidedSteps.every(step => step.action && step.why && step.expected && step.troubleshoot)), "Every PowerFactory major step needs action, reason, checkpoint and troubleshooting");

check(html.includes("The Power Systems Engineer's Book"), "The document title must identify the book experience");
check(html.includes('id="termPopover" role="dialog"'), "Interactive term explanations must use dialog rather than tooltip semantics");
check(html.includes('id="tutorPanel" role="dialog"') && html.includes(" inert>"), "The closed tutor must be an inert dialog");
check(app.includes("renderChapterJourney") && app.includes("renderChapterNavigation"), "Chapter map and previous/next navigation must render");
check(app.includes("Chapter ${w.n}") && app.includes("#chapter-${w.n}"), "Public chapter labels and routes must be chapter based");
check(app.includes("Prepare") && app.includes("Perform") && app.includes("Verify") && app.includes("Record"), "PowerFactory runbooks must use the four-stage execution cycle");
check(app.includes("data-lab-step") && app.includes("labProgress"), "Runbook checkpoints must persist locally");
check(app.includes("Now remove the scaffolding") && app.includes("Pause and explain it without looking"), "Worked-example fading and retrieval pauses must be present");
check(css.includes("prefers-reduced-motion") && css.includes(":focus-visible"), "Reduced-motion and visible-focus support must be present");
check(css.includes(".journey-flow") && css.includes(".step-runbook"), "The chapter journey and runbook must have responsive visual layouts");

const guide = data.sources.find(source => source.id === "g9899-guide");
check(guide?.edition.includes("Issue 3") && guide?.url.includes("EID=102117"), "The current G98/G99 Guide catalogue record must be used");
const apparent = data.glossaryMap["apparent power"];
check(apparent?.short.includes("|S|") && apparent?.short.includes("S = P + jQ"), "Complex and apparent power notation must be distinct");
const g99Text = data.weeks[24].sections.flatMap(section => section.paragraphs).join(" ");
check(g99Text.includes("importing-mode") && g99Text.includes("not limited to moments of export"), "G99 scope must include applicable storage importing-mode requirements");

if (failures.length) {
  console.error(`Book validation failed (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`PASS: chapter book UX, ${data.weeks.length} chapter journeys, accessible term/tutor semantics, PowerFactory runbooks and current UK source corrections.`);
