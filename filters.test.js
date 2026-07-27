"use strict";
/* Unit tests against the filter core carved straight out of index.html. */
const C = require("./core.fromhtml.js");
const { countryOf, parseSalary, looksLikeAgency, looksNotFullTime,
        kwStem, keywordStems, seniorityConflicts,
        splitList, annotate, applyFilters, dropLabel } = C;

let pass = 0, fail = 0;
function eq(a, b, label){
  const A = JSON.stringify(a), B = JSON.stringify(b);
  A === B ? pass++ : (fail++, console.log(`FAIL  ${label}\n      got ${A}, want ${B}`));
}
function ok(c, label){ c ? pass++ : (fail++, console.log("FAIL  " + label)); }

const daysAgo = n => new Date(Date.now() - n*86400000).toISOString();

/* ---------- country detection: the exact strings these four APIs return ---------- */
// The Muse (locations[].name)
eq(countryOf("New York, NY"),                   "us",  "Muse: New York, NY");
eq(countryOf("San Francisco, CA"),              "us",  "Muse: San Francisco, CA");
eq(countryOf("Austin, TX"),                     "us",  "Muse: Austin, TX");
eq(countryOf("London, United Kingdom"),         "gb",  "Muse: London, United Kingdom");
eq(countryOf("Flexible / Remote"),              "any", "Muse: Flexible / Remote");
// Adzuna (location.display_name)
eq(countryOf("Manchester, Greater Manchester"), "gb",  "Adzuna: Manchester");
eq(countryOf("Camden, North London"),           "gb",  "Adzuna: North London");
// Remotive (candidate_required_location)
eq(countryOf("USA Only"),                       "us",  "Remotive: USA Only");
eq(countryOf("Worldwide"),                      "any", "Remotive: Worldwide");
eq(countryOf("Europe"),                         "gb",  "Remotive: Europe -> a European code");
eq(countryOf("UK"),                             "gb",  "Remotive: UK");
// Jooble
eq(countryOf("Leeds"),                          "gb",  "Jooble: Leeds");
eq(countryOf("Sydney NSW"),                     "au",  "Jooble: Sydney NSW");
eq(countryOf("Toronto, ON"),                    "ca",  "Jooble: Toronto, ON");
eq(countryOf("Dublin"),                         "ie",  "Jooble: Dublin");
// ambiguous input must stay null so the filter never over-reaches
eq(countryOf(""),                               null,  "empty string");
eq(countryOf(null),                             null,  "null");
eq(countryOf("Head Office"),                    null,  "unrecognised");

/* ---------- salary parsing ---------- */
eq(parseSalary("£30,000 - £40,000"), 30000, "range takes the lower bound");
eq(parseSalary("$50k"),              50000, "k suffix");
eq(parseSalary("50k - 70k"),         50000, "k range");
eq(parseSalary(35000),               35000, "raw number");
eq(parseSalary("Competitive"),        null, "no figure -> not stated");
eq(parseSalary("£25 per hour"),       null, "hourly rate is not an annual salary");
eq(parseSalary(""),                   null, "empty");
eq(parseSalary(null),                 null, "null");

/* ---------- agency detection ---------- */
ok(looksLikeAgency({company:"Hays Recruitment"}),               "'Recruitment' in name");
ok(looksLikeAgency({company:"Blue Arrow Staffing"}),            "'Staffing' in name");
ok(looksLikeAgency({company:"Acme Ltd", description:"Our client is seeking a psychologist"}), "'our client' in body");
ok(!looksLikeAgency({company:"NHS Foundation Trust", description:"Join our team"}), "NHS trust is not an agency");
ok(!looksLikeAgency({company:"University of Leeds", description:"Applications invited"}), "university is not an agency");

/* ---------- full-time detection ---------- */
ok(looksNotFullTime({title:"Part-time Psychologist", type:""}),  "part-time in title");
ok(looksNotFullTime({title:"Psychologist", type:"Temporary"}),   "temporary in type");
ok(!looksNotFullTime({title:"Clinical Psychologist", type:"Full-time"}), "full-time survives");

/* ---------- keyword stemming: "Psychology" must match "Psychologist" ---------- */
eq(kwStem("Psychology"),   "psycholog", "psychology -> psycholog");
eq(kwStem("psychologist"), "psycholog", "psychologist -> same stem");
eq(kwStem("therapist"),    "therap",    "therapist -> therap");
eq(kwStem("nurses"),       "nurse",     "plural trimmed");
eq(kwStem("mental health"),"mental health", "multi-word left alone");
eq(kwStem("HR"),           "hr",        "too short to stem, kept whole");
ok("clinical psychologist".includes(kwStem("Psychology")),
   "the reported case: searching Psychology now matches a Psychologist job");

/* ---------- seniority: reject only an explicitly different level ---------- */
ok(seniorityConflicts("Head of Marketing & Communications", "graduate"), "Head of vs graduate");
ok(seniorityConflicts("Senior Independent AI Engineer", "graduate"),     "Senior vs graduate");
ok(!seniorityConflicts("Assistant Psychologist", "graduate"),  "assistant counts as graduate-ish");
ok(!seniorityConflicts("Clinical Psychologist", "graduate"),   "unmarked title is kept");
ok(!seniorityConflicts("Anything at all", ""),                 "no level set -> never conflicts");
ok(seniorityConflicts("Trainee Psychologist", "director"),     "trainee vs director");
// entry-level tiers must behave symmetrically in BOTH directions
ok(!seniorityConflicts("Graduate Mental Health Worker", "assistant"), "graduate title kept under Assistant");
ok(!seniorityConflicts("Assistant Psychologist", "graduate"),         "assistant title kept under Graduate");
ok(!seniorityConflicts("Junior Therapist", "graduate"),               "junior title kept under Graduate");
ok(!seniorityConflicts("Entry-Level Research Assistant", "graduate"), "entry-level kept under Graduate");
// and an unmarked title is kept at EVERY level — this is by design, not a bug
["assistant","graduate","senior","lead","director"].forEach(l =>
  ok(!seniorityConflicts("Clinical Psychologist", l), `unmarked title kept under ${l}`));

/* ---------- contract work is not full-time ---------- */
ok(looksNotFullTime({title:"Senior Developer", type:"contract"}), "contract");
ok(looksNotFullTime({title:"Freelance Writer", type:""}),         "freelance");
ok(looksNotFullTime({title:"Psychologist", type:"fixed term"}),   "fixed term");

/* ---------- splitList ---------- */
eq(splitList("a, b ,, c "), ["a","b","c"], "trims and drops empties");
eq(splitList(""), [], "empty string");

/* ---------- the whole chain, with drop accounting ---------- */
const ctx = {
  trusted:false, country:"gb", countryName:"United Kingdom", cur:"£", strict:true,
  blockKw:["night shift"], blockCo:["Hays"], hideAgency:false, hideNoSalary:false,
  salary:30000, fullTime:true, maxAge:14,
  relevance:false, stems:[], level:"", levelLabel:"",
};
const jobs = [
  { title:"Clinical Psychologist", company:"NHS Trust",  location:"Leeds",           salary:"£35,000", posted:daysAgo(2)  },
  { title:"Psychologist",          company:"Acme Inc",   location:"New York, NY",    salary:"$80,000", posted:daysAgo(1)  }, // country
  { title:"Therapist",             company:"Hays",       location:"Manchester",      salary:"£40,000", posted:daysAgo(1)  }, // blocked company
  { title:"Support Worker",        company:"CareCo",     location:"Bristol",         salary:"£31,000", posted:daysAgo(1),
    description:"Night shift work available" },                                                                             // blocked keyword
  { title:"Assistant Psychologist",company:"Uni of York",location:"York",            salary:"£22,000", posted:daysAgo(3)  }, // under salary
  { title:"Part-time Counsellor",  company:"Mind",       location:"Cardiff",         salary:"£33,000", posted:daysAgo(1)  }, // not full-time
  { title:"CBT Therapist",         company:"Talking Ltd",location:"Bristol",         salary:"£38,000", posted:daysAgo(40) }, // too old
  { title:"Psychologist (Remote)", company:"GlobalCo",   location:"Worldwide",       salary:"Competitive", posted:daysAgo(1) }, // salary unknown -> kept
];
jobs.forEach(j => annotate(j));

const out = applyFilters(jobs, ctx);
eq(out.kept.map(j=>j.title).sort(),
   ["Clinical Psychologist","Psychologist (Remote)"],
   "chain keeps only the two that pass every active filter");
eq(out.drops, { country:1, blockCo:1, blockKw:1, salary:1, fulltime:1, age:1 },
   "each rejection is attributed to exactly one filter");

/* An unstated salary must NOT be treated as a low salary... */
ok(out.kept.some(j=>j.title==="Psychologist (Remote)"), "unknown salary survives a salary floor");
/* ...unless the user explicitly asks to hide those. */
const strictSalary = applyFilters(jobs, Object.assign({}, ctx, {hideNoSalary:true}));
ok(!strictSalary.kept.some(j=>j.title==="Psychologist (Remote)"), "hideNoSalary removes it");
eq(strictSalary.drops.nosalary, 1, "and attributes it to nosalary");

/* Turning every filter off must return everything — proves nothing is hardcoded. */
const off = applyFilters(jobs, {
  trusted:false, country:"gb", countryName:"United Kingdom", cur:"£", strict:false,
  blockKw:[], blockCo:[], hideAgency:false, hideNoSalary:false, salary:0, fullTime:false, maxAge:0,
  relevance:false, stems:[], level:"", levelLabel:"" });
eq(off.kept.length, jobs.length, "all filters off returns every job");
eq(off.drops, {}, "and drops nothing");

/* Agency filter is independent of the rest. */
const agencyJobs = [
  { title:"A", company:"Hays Recruitment", location:"Leeds", posted:daysAgo(1) },
  { title:"B", company:"NHS Trust",        location:"Leeds", posted:daysAgo(1) },
].map(j=>annotate(j));
const agencyOff = { trusted:false, country:"gb", countryName:"UK", cur:"£", strict:false,
  blockKw:[], blockCo:[], hideAgency:false, hideNoSalary:false, salary:0, fullTime:false, maxAge:0,
  relevance:false, stems:[], level:"", levelLabel:"" };
eq(applyFilters(agencyJobs, agencyOff).kept.length, 2, "agency listings kept when toggle off");
eq(applyFilters(agencyJobs, Object.assign({}, agencyOff, {hideAgency:true})).kept.map(j=>j.title),
   ["B"], "agency listings dropped when toggle on");
ok(agencyJobs[0].isAgency && !agencyJobs[1].isAgency, "agency flag still set for the UI chip either way");

/* Labels the status bar shows the user. */
eq(dropLabel("country", ctx),  "outside United Kingdom", "country label");
eq(dropLabel("salary",  ctx),  "under £30,000",          "salary label");
eq(dropLabel("age",     ctx),  "older than 14 days",     "age label");

/* ============================================================
   Regression: the exact result set from the reported screenshots.
   Searching "Psychology", Graduate/Trainee, UK, full-time only —
   and getting back contract AI/marketing roles from Remotive.
   ============================================================ */
const reported = [
  { title:"Head of Marketing & Communications", company:"garden3d", location:"Worldwide · Remote",
    salary:"$150k - $230k", type:"contract", posted:daysAgo(11),
    description:"We are hiring a Head of Marketing & Communications to tell the garden3d story" },
  { title:"Senior Independent AI Engineer / Architect", company:"A.Team",
    location:"Americas, Europe, Israel · Remote", salary:"$120 - $170 /hour", type:"contract",
    posted:daysAgo(11), description:"A.Team is an invite-only network of senior AI engineers" },
  { title:"Senior Independent Software Developer", company:"A.Team",
    location:"Americas, Europe, Israel · Remote", salary:"$90 - $150 /hour", type:"contract",
    posted:daysAgo(11), description:"You must be located in the Americas, Europe, or Israel to apply" },
  // ...and the kind of job that SHOULD have been showing instead
  { title:"Assistant Psychologist", company:"Manchester NHS Foundation Trust", location:"Manchester",
    salary:"£31,000", type:"Full-time", posted:daysAgo(4),
    description:"An exciting opportunity for an assistant psychologist to join our team" },
].map(j => annotate(j));

const reportedCtx = {
  trusted:false, country:"gb", countryName:"United Kingdom", cur:"£", strict:true,
  blockKw:[], blockCo:[], hideAgency:false, hideNoSalary:false,
  salary:30000, fullTime:true, maxAge:0,
  relevance:true, stems:keywordStems(["Psychology"]), level:"graduate", levelLabel:"Graduate / Trainee",
};
const fixed = applyFilters(reported, reportedCtx);
eq(fixed.kept.map(j=>j.title), ["Assistant Psychologist"],
   "all three off-topic contract roles are gone; the NHS job survives");
ok(!fixed.kept.some(j=>j.company === "A.Team"),  "no A.Team");
ok(!fixed.kept.some(j=>j.company === "garden3d"), "no garden3d");

/* Each of the three failures is independently sufficient — check they're all real. */
const only = extra => applyFilters(reported, Object.assign(
  { trusted:false, country:"gb", countryName:"United Kingdom", cur:"£", strict:false,
    blockKw:[], blockCo:[], hideAgency:false, hideNoSalary:false, salary:0, fullTime:false, maxAge:0,
    relevance:false, stems:[], level:"", levelLabel:"" }, extra));
eq(only({relevance:true, stems:keywordStems(["Psychology"])}).kept.map(j=>j.title),
   ["Assistant Psychologist"], "relevance filter alone removes all three");
eq(only({level:"graduate"}).kept.map(j=>j.title),
   ["Assistant Psychologist"], "seniority filter alone removes all three");
eq(only({fullTime:true}).kept.map(j=>j.title),
   ["Assistant Psychologist"], "full-time filter alone removes all three (contract)");

console.log(`\n${pass} passed, ${fail} failed  (totals above include the regression block)`);
process.exit(fail ? 1 : 0);
