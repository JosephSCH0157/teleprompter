const fs = require('fs');
const path = process.argv[2] || 'd:/teleprompter/teleprompter/teleprompter_pro.js';
const text = fs.readFileSync(path, 'utf8');
const open = '([{';
const close = ')]}';
const pairs = { '(': ')', '[': ']', '{': '}' };
const stack = [];
let line = 1,
  col = 0;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '\n') {
    line++;
    col = 0;
    continue;
  }
  col++;
  if (open.includes(ch)) {
    stack.push({ ch, line, col, pos: i });
  } else if (close.includes(ch)) {
    const expectedOpen = Object.keys(pairs).find((k) => pairs[k] === ch);
    const last = stack.pop();
    if (!last) {
      console.log(`UNMATCHED_CLOSE ${ch} at line ${line} col ${col}`);
      process.exit(2);
    }
    if (last.ch !== expectedOpen) {
      console.log(
        `MISMATCH ${last.ch}->${ch} at line ${line} col ${col} (opened at line ${last.line} col ${last.col})`
      );
      process.exit(3);
    }
  }
}
if (stack.length) {
  const last = stack[stack.length - 1];
  console.log(`UNMATCHED_OPEN ${last.ch} opened at line ${last.line} col ${last.col}`);
  process.exit(4);
}
console.log('BALANCE_OK');
