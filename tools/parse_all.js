const fs = require('fs');
const acorn = require('acorn');

const file = process.argv[2] || 'd:/teleprompter/teleprompter/teleprompter_pro.js';
try {
  const src = fs.readFileSync(file, 'utf8');
  try {
    acorn.parse(src, { ecmaVersion: 2022, locations: true, sourceType: 'module' });
    console.log('PARSE_OK');
  } catch (e) {
    console.error('PARSE_ERROR', e.message);
    if (e.loc) console.error('at', e.loc);
    process.exit(2);
  }
} catch (err) {
  console.error('READ_ERROR', err.message);
  process.exit(1);
}

