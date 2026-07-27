"use strict";
/* Unit tests against the filter core carved straight out of index.html. */
const C = require("./core.fromhtml.js");
const { countryOf, parseSalary, looksLikeAgency, looksNotFullTime,
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

/* ---------- splitList ---------- */
eq(splitList("a, b ,, c "), ["a","b","c"], "trims and drops empties");
eq(splitList(""), [], "empty string");

/* ---------- the whole chain, with drop accounting ---------- */
const ctx = {
  trusted:false, country:"gb", countryName:"United Kingdom", cur:"£", strict:true,
  blockKw:["night shift"], blockCo:["Hays"], hideAgency:false, hideNoSalary:false,
  salary:30000, fullTime:true, maxAge:14,
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
  blockKw:[], blockCo:[], hideAgency:false, hideNoSalary:false, salary:0, fullTime:false, maxAge:0 });
eq(off.kept.length, jobs.length, "all filters off returns every job");
eq(off.drops, {}, "and drops nothing");

/* Agency filter is independent of the rest. */
const agencyJobs = [
  { title:"A", company:"Hays Recruitment", location:"Leeds", posted:daysAgo(1) },
  { title:"B", company:"NHS Trust",        location:"Leeds", posted:daysAgo(1) },
].map(j=>annotate(j));
const agencyOff = { trusted:false, country:"gb", countryName:"UK", cur:"£", strict:false,
  blockKw:[], blockCo:[], hideAgency:false, hideNoSalary:false, salary:0, fullTime:false, maxAge:0 };
eq(applyFilters(agencyJobs, agencyOff).kept.length, 2, "agency listings kept when toggle off");
eq(applyFilters(agencyJobs, Object.assign({}, agencyOff, {hideAgency:true})).kept.map(j=>j.title),
   ["B"], "agency listings dropped when toggle on");
ok(agencyJobs[0].isAgency && !agencyJobs[1].isAgency, "agency flag still set for the UI chip either way");

/* Labels the status bar shows the user. */
eq(dropLabel("country", ctx),  "outside United Kingdom", "country label");
eq(dropLabel("salary",  ctx),  "under £30,000",          "salary label");
eq(dropLabel("age",     ctx),  "older than 14 days",     "age label");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
