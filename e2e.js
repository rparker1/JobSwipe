const { chromium } = require('playwright');
const path = require('path');

const iso = d => new Date(Date.now() - d*86400000).toISOString();

// Muse ignores our location params on purpose here — that is what proves the
// client-side backstop catches what the server-side param misses.
const MUSE = { results: [
  { id:1, name:"Psychologist", company:{name:"Hays Recruitment"},          // agency, newest -> top card
    locations:[{name:"Manchester, United Kingdom"}], refs:{landing_page:"https://ex.com/1"},
    contents:"psychologist role, our client is a leading trust", publication_date:iso(0), levels:[] },
  { id:2, name:"Clinical Psychologist", company:{name:"NHS Foundation Trust"},
    locations:[{name:"London, United Kingdom"}], refs:{landing_page:"https://ex.com/2"},
    contents:"psychologist role", publication_date:iso(1), levels:[] },
  { id:3, name:"Senior Psychologist", company:{name:"Beta Health"},        // wrong country
    locations:[{name:"Austin, TX"}], refs:{landing_page:"https://ex.com/3"},
    contents:"psychologist role", publication_date:iso(2), levels:[] },
  { id:4, name:"Head of Marketing & Communications", company:{name:"garden3d"},  // off-topic
    locations:[{name:"London, United Kingdom"}], refs:{landing_page:"https://ex.com/4"},
    contents:"tell the garden3d story across the internet", publication_date:iso(4), levels:[] },
]};

// Remotive returns different jobs per keyword, so if only the first keyword is
// sent (the old bug) the second job can never appear.
function remotiveFor(search){
  const byKw = {
    psychologist: { id:11, title:"Remote Psychologist", company_name:"Gamma" },
    counsellor:   { id:12, title:"Remote Counsellor",   company_name:"Delta" },
  };
  const j = byKw[search];
  return { jobs: j ? [{ ...j, candidate_required_location:"UK", url:"https://ex.com/"+j.id,
                        description:"remote role", publication_date:iso(3) }] : [] };
}

let pass = 0, fail = 0;
function ok(c, label){ c ? pass++ : (fail++, console.log("FAIL  " + label)); }
function eq(a, b, label){
  const A = JSON.stringify(a), B = JSON.stringify(b);
  A === B ? pass++ : (fail++, console.log(`FAIL  ${label}\n      got ${A}, want ${B}`));
}

(async () => {
  // On a normal machine `npx playwright install` puts chromium where Playwright
  // expects it and no path is needed. CHROMIUM_PATH is only an escape hatch for
  // sandboxes/CI that ship their own browser build.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const page = await browser.newPage();

  let remotiveHits = [];
  // regex, not glob: `**/themuse.com/**` needs a literal "/" before the host,
  // and the real URL has "www." there, so the glob silently never matches.
  await page.route(/themuse\.com/,  r => r.fulfill({ json: MUSE }));
  await page.route(/remotive\.com/, r => {
    const s = new URL(r.request().url()).searchParams.get('search') || '';
    remotiveHits.push(s);
    return r.fulfill({ json: remotiveFor(s) });
  });
  await page.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ body:'', contentType:'application/javascript' }));
  // index.html now ships with working Adzuna/Jooble keys, so those sources are
  // live rather than skipped. Stub them empty so the suite stays hermetic and
  // never depends on (or burns quota against) the real APIs.
  await page.route(/api\.adzuna\.com/, r => r.fulfill({ json: { results: [] } }));
  await page.route(/jooble\.org/,      r => r.fulfill({ json: { jobs: [] } }));

  await page.goto('file://' + path.join(__dirname, 'index.html'));

  /* ---------- location is visible without opening Settings ---------- */
  eq(await page.textContent('#locWhere'), 'UK', 'location pill shows UK on load');
  eq(await page.textContent('#locFlag'), '🇬🇧', 'location pill shows UK flag');

  /* ---------- every keyword is searched, not just the first ---------- */
  await page.click('nav button[data-tab="settings"]');
  await page.fill('#pKeywords', 'psychologist, counsellor');
  ok(/All 2 searched/.test(await page.textContent('#kwNote')), 'settings echoes that both keywords are used');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined' && queue.length > 0, null, { timeout: 8000 });

  eq(remotiveHits.sort(), ['counsellor','psychologist'], 'Remotive got one request per keyword');
  const titles = await page.evaluate(() => queue.map(j => j.title).sort());
  ok(titles.includes('Remote Counsellor'),
     'the SECOND keyword produced a job — the keywordList()[0] bug is gone');

  /* ---------- off-topic jobs are rejected (the reported screenshot bug) ---------- */
  ok(!titles.includes('Head of Marketing & Communications'),
     'a UK job that never mentions the keyword is rejected as off-topic');
  ok(/off-topic/.test(await page.textContent('#filterReport')),
     'and the reason is reported by name');
  // "psychologist" matching a job whose text says "psychologist" is trivial; the
  // real test is that stemming lets "Psychology" match too.
  await page.click('nav button[data-tab="settings"]');
  await page.fill('#pKeywords', 'Psychology');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined' && queue.length > 0, null, { timeout: 8000 });
  ok(await page.evaluate(() => queue.some(j => /Psychologist/.test(j.title))),
     'searching "Psychology" still matches "...Psychologist" jobs (stemming)');
  await page.click('nav button[data-tab="settings"]');
  await page.fill('#pKeywords', 'psychologist, counsellor');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined' && queue.length > 0, null, { timeout: 8000 });

  /* ---------- country filtering still holds ---------- */
  ok(!titles.includes('Senior Psychologist'), 'the Austin TX job was filtered out of a UK search');
  const report = await page.textContent('#filterReport');
  ok(/1 outside United Kingdom/.test(report), 'filter report names the country drop — got: ' + report);

  /* ---------- agency listings are flagged, not silently dropped ---------- */
  const isAgency = await page.evaluate(() =>
    queue.filter(j => j.isAgency).map(j => j.company));
  eq(isAgency, ['Hays Recruitment'], 'only the agency listing is flagged');
  const topCard = await page.textContent('.card:last-of-type');
  ok(/Agency/.test(topCard), 'top card shows the Agency chip');
  ok(/Hays Recruitment/.test(topCard), 'top card is the newest job');

  /* ---------- Block on a card removes it and persists ---------- */
  const before = await page.evaluate(() => queue.length);
  await page.click('.card:last-of-type .blockco');
  await page.waitForFunction(n => queue.length < n, before, { timeout: 4000 });
  ok(!(await page.evaluate(() => queue.some(j => j.company === 'Hays Recruitment'))),
     'blocked company removed from the live queue');
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('js_prefs_v1')).blockCo),
     'Hays Recruitment', 'block persisted to prefs');

  /* ---------- salary floor keeps unstated salaries ---------- */
  await page.click('nav button[data-tab="settings"]');
  await page.fill('#pSalary', '30000');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined' && queue.length > 0, null, { timeout: 8000 });
  ok(await page.evaluate(() => queue.every(j => j.salaryNum === null)),
     'jobs with no stated salary survive a salary floor (bias toward keeping)');

  /* ...until the user says otherwise */
  await page.click('nav button[data-tab="settings"]');
  await page.check('#pHideNoSalary');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined' && queue.length === 0, null, { timeout: 8000 });
  ok(/no salary listed/.test(await page.textContent('#filterReport')),
     'hideNoSalary is reported back by name');
  await page.click('nav button[data-tab="settings"]');
  await page.uncheck('#pHideNoSalary');
  await page.fill('#pSalary', '');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined' && queue.length > 0, null, { timeout: 8000 });

  /* ---------- blocked keyword ---------- */
  await page.click('nav button[data-tab="settings"]');
  await page.fill('#pBlockKw', 'remote role');
  ok(/remote role/.test(await page.innerHTML('#blockKwTags')), 'blocked keyword renders as a removable tag');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined', null, { timeout: 8000 });
  ok(!(await page.evaluate(() => queue.some(j => j.source === 'Remotive'))),
     'blocked keyword removed the Remotive jobs');
  ok(/blocked keyword/.test(await page.textContent('#filterReport')), 'and is reported by name');

  /* ---------- switching country flips the result set ---------- */
  await page.click('nav button[data-tab="settings"]');
  await page.fill('#pBlockKw', '');
  await page.fill('#pBlockCo', '');
  await page.selectOption('#pCountry', 'us');
  ok(/United States/.test(await page.textContent('#countryEcho')), 'settings echo updates live before saving');
  await page.click('#prefsForm button[type="submit"]');
  await page.waitForFunction(() => typeof queue !== 'undefined' && queue.some(j => j.geo === 'us'),
                             null, { timeout: 8000 });
  ok(await page.evaluate(() => queue.some(j => j.title === 'Senior Psychologist')),
     'US search surfaces the Austin job that UK hid');
  ok(!(await page.evaluate(() => queue.some(j => j.company === 'NHS Foundation Trust'))),
     'US search drops the London job — the filter is not just "drop everything"');
  eq(await page.textContent('#locWhere'), 'US', 'location pill followed the country change');

  /* ---------- boards tab is country-aware ---------- */
  await page.click('nav button[data-tab="boards"]');
  const boardsUS = await page.textContent('#boardsList');
  ok(/PsycCareers/.test(boardsUS), 'US shows US psychology boards');
  ok(!/BPS Jobs/.test(boardsUS),   'US does not show the UK BPS board');

  await page.click('nav button[data-tab="settings"]');
  await page.selectOption('#pCountry', 'au');
  await page.click('#prefsForm button[type="submit"]');
  await page.click('nav button[data-tab="boards"]');
  const boardsAU = await page.textContent('#boardsList');
  ok(/Seek/.test(boardsAU),         'AU shows Seek');
  ok(!/PsycCareers/.test(boardsAU), 'AU no longer inherits US boards (the old uk-vs-else bug)');
  ok(/au\.indeed\.com/.test(await page.innerHTML('#boardsList')), 'AU gets the Australian Indeed domain');

  /* ---------- everything survives a reload ---------- */
  await page.reload();
  eq(await page.textContent('#locWhere'), 'AU', 'country survives reload on the pill');
  await page.click('nav button[data-tab="settings"]');
  eq(await page.inputValue('#pCountry'), 'au', 'settings form reflects saved country after reload');
  eq(await page.inputValue('#pKeywords'), 'psychologist, counsellor', 'keywords survive reload');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
