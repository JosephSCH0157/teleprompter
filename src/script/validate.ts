// Pure string-based validator for teleprompter scripts

export type ValidationIssue = { line: number; message: string; type: string; detail?: any };

export function validateStandardTagsText(input: string) {
  const src = String(input || '');
  const lines = src.split(/\r?\n/);
  (window as any).validatorConfig = (window as any).validatorConfig || { allowedTags: new Set(['s1', 's2', 'note']) };
  const allowed: Set<string> = (window as any).validatorConfig.allowedTags;
  const speakerTags = new Set(['s1', 's2']);
  const stack: Array<{ tag: string; line: number }> = [];
  let s1Blocks = 0, s2Blocks = 0, noteBlocks = 0;
  let unknownCount = 0;
  const issues: string[] = [];
  const issueObjs: ValidationIssue[] = [];
  function addIssue(line: number, msg: string, type = 'issue', detail?: any) {
    issues.push(`line ${line}: ${msg}`);
    issueObjs.push({ line, message: msg, type, detail });
  }
  const tagRe = /\[(\/)?([a-z0-9]+)(?:=[^\]]+)?\]/gi;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;
    let m: RegExpExecArray | null = null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(rawLine))) {
      const closing = !!m[1];
      const nameRaw = m[2];
      const name = nameRaw.toLowerCase();
      if (!allowed.has(name)) {
        unknownCount++;
        addIssue(lineNum, `unsupported tag [${closing ? '/' : ''}${nameRaw}]`, 'unsupported', { tag: name });
        continue;
      }
      if (!closing) {
        if (name === 'note') {
          if (stack.length) addIssue(lineNum, `[note] must not appear inside [${stack[stack.length - 1].tag}] (opened line ${stack[stack.length - 1].line})`, 'nested-note', { parent: stack[stack.length - 1].tag });
          stack.push({ tag: name, line: lineNum });
        } else if (speakerTags.has(name)) {
          if (stack.length && speakerTags.has(stack[stack.length - 1].tag)) addIssue(lineNum, `[${name}] opened before closing previous [${stack[stack.length - 1].tag}] (opened line ${stack[stack.length - 1].line})`, 'nested-speaker', { prev: stack[stack.length - 1].tag, prevLine: stack[stack.length - 1].line });
          stack.push({ tag: name, line: lineNum });
        } else {
          stack.push({ tag: name, line: lineNum });
        }
      } else {
        if (!stack.length) {
          addIssue(lineNum, `stray closing tag [/${name}]`, 'stray-close', { tag: name });
          continue;
        }
        const top = stack[stack.length - 1];
        if (top.tag === name) {
          stack.pop();
          if (name === 's1') s1Blocks++; else if (name === 's2') s2Blocks++; else if (name === 'note') noteBlocks++;
        } else {
          addIssue(lineNum, `mismatched closing [/${name}] – expected [/${top.tag}] for opening on line ${top.line}`, 'mismatch', { expected: top.tag, openLine: top.line, found: name });
          let poppedAny = false;
          while (stack.length && stack[stack.length - 1].tag !== name) { stack.pop(); poppedAny = true; }
          if (stack.length && stack[stack.length - 1].tag === name) {
            const opener = stack.pop();
            if (name === 's1') s1Blocks++; else if (name === 's2') s2Blocks++; else if (name === 'note') noteBlocks++;
            if (poppedAny && opener) addIssue(lineNum, `auto-recovered by closing [/${name}] (opened line ${opener.line}) after mismatches`, 'auto-recover', { tag: name, openLine: opener.line });
          } else addIssue(lineNum, `no matching open tag for [/${name}]`, 'no-match', { tag: name });
        }
      }
    }
  }
  for (const open of stack) addIssue(open.line, `unclosed [${open.tag}] opened here`, 'unclosed', { tag: open.tag });
  const summaryParts = [`s1 blocks: ${s1Blocks}`, `s2 blocks: ${s2Blocks}`, `notes: ${noteBlocks}`];
  if (unknownCount) summaryParts.push(`unsupported tags: ${unknownCount}`);
  const fixes: any[] = [];
  for (const iss of issueObjs) {
    if (iss.type === 'unclosed' && /(s1|s2)/i.test(iss.message)) {
      const tag = iss.message.match(/\[(s1|s2)\]/i)?.[1];
      if (tag) fixes.push({ type: 'append-close', tag, label: `Append closing [/${tag}] at end`, apply: (text: string) => text + (text.endsWith('\n') ? '' : '\n') + `[/${tag}]\n` });
    } else if (iss.type === 'stray-close') {
      fixes.push({ type: 'remove-line', line: iss.line, label: `Remove stray closing tag on line ${iss.line}`, apply: (text: string) => text.split(/\r?\n/).filter((_, i) => i !== iss.line - 1).join('\n') });
    } else if (iss.type === 'mismatch') {
      const found = iss.message.match(/mismatched closing \[\/(\w+)\]/i)?.[1];
      const expected = iss.message.match(/expected \[\/(\w+)\]/i)?.[1];
      if (found && expected && found !== expected) fixes.push({ type: 'replace-tag', line: iss.line, from: found, to: expected, label: `Replace [/${found}] with [/${expected}] on line ${iss.line}`, apply: (text: string) => { const arr = text.split(/\r?\n/); const ln = arr[iss.line - 1]; if (ln) arr[iss.line - 1] = ln.replace(new RegExp(`\[\/${found}\]`, 'i'), `[\/${expected}]`); return arr.join('\n'); } });
    }
  }
  const msg = !issues.length ? `No issues found. (${summaryParts.join(', ')})` : `Validation issues (${issues.length}):\n- ${issues.join('\n- ')}\n\nSummary: ${summaryParts.join(', ')}`;
  (window as any).__lastValidation = { issues: issueObjs, summary: summaryParts, fixes };
  return { report: msg, issues: issueObjs, summary: summaryParts, fixes };
}
