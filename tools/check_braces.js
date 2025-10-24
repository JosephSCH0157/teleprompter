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
    else if(ch==='}') { brace--; if(brace<0){ console.log('UNBALANCED_CURLY at line',i+1,'col',j+1); process.exit(0);} }
  }
}
console.log('FINAL_BRACE_COUNT', brace);
