"use strict";
/* Prints what each Seniority setting does to a set of realistic job titles.
   ✓ = shown, · = hidden as "wrong level". */
const { seniorityConflicts, LEVEL_LABELS } = require("./core.fromhtml.js");

const LEVELS = ["", "assistant", "graduate", "senior", "lead", "director"];
const TITLES = [
  "Assistant Psychologist",
  "Trainee Clinical Psychologist",
  "Graduate Mental Health Worker",
  "Entry-Level Research Assistant",
  "Junior Therapist",
  "Clinical Psychologist",
  "Psychological Wellbeing Practitioner",
  "Band 6 Psychologist",
  "Senior Clinical Psychologist",
  "Principal Psychologist",
  "Lead Psychologist",
  "Psychology Service Manager",
  "Head of Psychological Services",
  "Director of Mental Health",
];

const head = LEVELS.map(l => (l ? LEVEL_LABELS[l] : "Any level")).map(s => s.padEnd(18)).join("");
console.log("".padEnd(40) + head);
console.log("-".repeat(40 + head.length));
for(const t of TITLES){
  const row = LEVELS.map(l => (seniorityConflicts(t, l) ? "·" : "✓").padEnd(18)).join("");
  console.log(t.padEnd(40) + row);
}
