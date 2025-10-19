// tools/test-format.js
// Tiny, dependency-free harness that loads ui/format.js into a Node VM
// and exercises the runtime shim implementation.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.resolve(__dirname, '../ui/format.js');
const code = fs.readFileSync(file, 'utf8');

// Create a fake browser window + minimal globals used by the shim
const sandbox = {
  window: {},
  console,
};
vm.createContext(sandbox);

try {
  vm.runInContext(code, sandbox, { filename: 'ui/format.js' });
  const fn = sandbox.window.formatInlineMarkupImpl || sandbox.window.formatInlineMarkup;
  if (typeof fn !== 'function') {
    console.error('formatInlineMarkup not exposed');
    process.exit(2);
  }

  const cases = [
    { in: '[b]hey[/b]', out: '<strong>hey</strong>' },
    { in: '[s1]Hello[/s1]', outContains: 'Hello' },
    { in: 'plain text', out: 'plain text' },
    { in: '[note]as block[/note]', outContains: '<div class="note">' },
  ];
  let ok = true;
  for (const c of cases) {
    const res = fn(c.in);
    if (c.out && res !== c.out) {
      console.error('FAIL', c.in, '=>', res, 'expected', c.out);
      ok = false;
    } else if (c.outContains && !res.includes(c.outContains)) {
      console.error('FAIL contains', c.in, '=>', res, 'expected contains', c.outContains);
      ok = false;
    } else {
      console.log('PASS', c.in, '=>', res.slice(0, 80));
    }
  }
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error('ERROR running test:', e);
  process.exit(3);
}
