const fs = require('fs');
const path = 'd:/teleprompter/teleprompter/teleprompter_pro.js';
const src = fs.readFileSync(path, 'utf8');
const lines = src.split(/\r?\n/);
let lo = 1, hi = lines.length, firstBad = -1;
while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  const chunk = lines.slice(0, mid).join('\n');
  try {
    new Function(chunk);
    lo = mid + 1;
  } catch (err) {
    firstBad = mid;
    hi = mid - 1;
  }
}
if (firstBad === -1) console.log('NO_ERROR_IN_PREFIX_SCAN');
else console.log('FIRST_BAD_LINE_APPROX', firstBad);
