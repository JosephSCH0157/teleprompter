const fs = require('fs');
const s = fs.readFileSync('d:/teleprompter/teleprompter/teleprompter_pro.js','utf8');
const lines = s.split(/\r?\n/);
let brace = 0;
function isEscaped(str,i){ let k=0; while(i-1-k>=0 && str[i-1-k]=='\\') k++; return k%2===1; }
let inSingle = false, inDouble = false, inBack = false;
for(let i=0;i<lines.length;i++){
  const ln = lines[i];
  for(let j=0;j<ln.length;j++){
    const ch = ln[j];
    if(ch==="'" && !inDouble && !inBack && !isEscaped(ln,j)) { inSingle=!inSingle; continue; }
    if(ch==='"' && !inSingle && !inBack && !isEscaped(ln,j)) { inDouble=!inDouble; continue; }
    if(ch==='`' && !inSingle && !inDouble && !isEscaped(ln,j)) { inBack=!inBack; continue; }
    if(inSingle||inDouble||inBack) continue;
    if(ch==='{') brace++;
    else if(ch==='}') brace--;
  }
  if(brace<0){
    console.log('NEGATIVE brace at line', i+1, 'brace=', brace);
    console.log('LINE:', lines[i]);
    // print surrounding lines
    const start = Math.max(0, i-4);
    const end = Math.min(lines.length-1, i+4);
    for(let k=start;k<=end;k++) console.log((k+1)+':', lines[k]);
    process.exit(0);
  }
}
console.log('NO_NEGATIVE; FINAL brace=', brace);
