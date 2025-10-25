// Pure string-based normalizers for teleprompter scripts

export function fallbackNormalizeText(input: string): string {
  let txt = String(input || '');
  txt = txt.replace(/\r\n?/g, '\n').replace(/ +\n/g, '\n').replace(/[’]/g, "'");
  txt = txt
    .replace(/\[\/\s*s1\s*\]/gi, '[/s1]')
    .replace(/\[\/\s*s2\s*\]/gi, '[/s2]')
    .replace(/\[\/\s*note\s*\]/gi, '[/note]');
  return txt;
}

export function normalizeToStandardText(input: string): string {
  let txt = String(input || '');
  txt = txt
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[’]/g, "'")
    .replace(/\[\s*(s1|s2|note)\s*\]/gi, (_, x) => `[${(x || '').toLowerCase()}]`)
    .replace(/\[\s*\/\s*(s1|s2|note)\s*\]/gi, (_, x) => `[/${(x || '').toLowerCase()}]`);

  // Move inline notes out of speaker paragraphs
  txt = txt.replace(
    /\[(s1|s2)\]([\s\S]*?)\[note\]([\s\S]*?)\[\/note\]([\s\S]*?)\[\/\1\]/gi,
    (_, r, pre, note, post) => `[note]${note.trim()}[/note]\n[${r}]${(pre + ' ' + post).trim()}[/${r}]`
  );

  txt = txt
    .replace(/\[(s1|s2)\]\s*(?=\S)/gi, (_, r) => `[${r}]\n`)
    .replace(/([^\n])\s*\[\/s(1|2)\](?=\s*$)/gim, (_, ch, sp) => `${ch}\n[/s${sp}]`);

  txt = txt.replace(/\n?(\[note\][\s\S]*?\[\/note\])\n?/gi, '\n$1\n');
  txt = txt.replace(/\n{3,}/g, '\n\n').trim() + '\n';

  const blocks = txt.split(/\n{2,}/);
  let current = 's1';
  const out: string[] = [];
  for (let b of blocks) {
    const first = b.match(/^\s*\[(s1|s2|note)\]/i)?.[1]?.toLowerCase();
    if (first === 'note') {
      out.push(b);
      continue;
    }
    if (first === 's1' || first === 's2') {
      current = first;
      if (!/\[\/s[12]\]/i.test(b)) b = b + `\n[/${current}]`;
      out.push(b);
    } else {
      out.push(`[${current}]\n${b}\n[/${current}]`);
    }
  }
  return out.join('\n\n') + '\n';
}
