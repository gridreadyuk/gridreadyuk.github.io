import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const storage = new Map();
const window = { __GRIDREADY_TEST_MODE__: true };
window.window = window;
const context = {
  window,
  structuredClone,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value) },
  setTimeout, clearTimeout,
  console
};
vm.createContext(context);
for (const file of ["data.js","teacher-data.js","mastery-data.js","app.js"]) vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
const tutor = window.__GRIDREADY_TEST__;
tutor.initialiseTutor();
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

let answer = tutor.ask("Calculate current for 15 MVA");
check(answer.text.includes("What line-line voltage"), "Tutor should ask for a missing voltage");
answer = tutor.ask("33 kV");
check(answer.text.includes("262.4 A"), "Tutor should use the next-turn voltage and calculate 262.4 A");

tutor.resetTutor();
tutor.ask("Calculate current for 20 MVA");
answer = tutor.ask("For a G99 project at 33 kV, explain Registered Capacity");
check(!answer.text.includes("Three-phase current from apparent power"), "A topic switch must cancel a pending calculation");
check(tutor.state().pendingCalculation === null, "Cancelled pending calculation must not persist");

answer = tutor.ask("G99 vs G100");
check(answer.text.includes("G99 versus G100"), "Comparison should preserve the requested order");
check(answer.citations.some(c=>c.url?.startsWith("https://")), "G99/G100 comparison should cite an official source");

answer = tutor.ask("What is the formula and units for per-unit impedance?");
check(answer.text.includes("formula and symbols") && answer.text.includes("Symbols, units, assumptions and traps"), "Formula intent should include the equation and its technical metadata");

answer = tutor.ask("Why does a PV bus become a PQ bus at its reactive power limit?");
check(answer.text.includes("Q is clamped") && answer.text.includes("voltage may move"), "Tutor should answer a causal PV-to-PQ limit question rather than returning only a reactive-power definition");

answer = tutor.ask("Show every PowerFactory step for Week 12");
check(answer.text.includes("PowerFactory:") && answer.text.includes("fault"), "Explicit Week 12 PowerFactory request should route to the Week 12 lab");

tutor.resetTutor();
answer = tutor.ask("How in PowerFactory?");
check(answer.text.includes("once the study is identified"), "Generic PowerFactory wording should request the study target");

tutor.resetTutor();
answer = tutor.ask("Teach me per-unit step by step");
answer = tutor.ask("worked example");
check(answer.text.toLowerCase().includes("worked example"), `Worked-example follow-up should inherit the remembered topic; got: ${answer.text.slice(0,120)}`);

answer = tutor.ask("fault");
check(answer.text.includes("too broad"), "Broad one-word technical query should trigger clarification");
answer = tutor.ask("quantum banana relay");
check(answer.text.includes("reliable local answer") || answer.text.includes("exact term"), "Low-confidence tutor query should be refused rather than invented");

if (failures.length) {
  console.error(`Tutor validation failed (${failures.length}):`);
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS: tutor alias/context retrieval, comparison citations, formula intent, explicit-week PowerFactory routing, multi-turn calculations and refusal paths.");
