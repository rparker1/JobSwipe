#!/usr/bin/env bash
# JobSwipe test runner.
#
# index.html stays a single self-contained file, so the tests carve the filter
# logic out of it at run time rather than duplicating it. The carve is anchored
# on the "FILTER CORE" / "END FILTER CORE" comment markers in the <script> block
# — if you move that section, keep the markers with it.
set -euo pipefail
cd "$(dirname "$0")"

echo "→ extracting filter core from index.html"
python3 - <<'PY'
import re
html = open('index.html').read()
app  = re.findall(r'<script>(.*?)</script>', html, re.S)[-1]
open('app.extracted.js','w').write(app)
core = app[app.index('const COUNTRIES = {'):app.index('   END FILTER CORE')]
core = core[:core.rindex('/* ====')]
core += ("\nmodule.exports={COUNTRIES,countryOf,parseSalary,looksLikeAgency,looksNotFullTime,"
         "kwStem,keywordStems,seniorityConflicts,LEVEL_MARKERS,LEVEL_LABELS,"
         "ageDays,splitList,annotate,applyFilters,dropLabel,FILTERS};\n")
open('core.fromhtml.js','w').write('"use strict";\n' + core)
PY

echo "→ syntax check"
node --check app.extracted.js
node --check core.fromhtml.js

echo "→ unit tests (filter logic)"
node filters.test.js

echo "→ end-to-end tests (real browser)"
node e2e.js

echo
echo "all green"
