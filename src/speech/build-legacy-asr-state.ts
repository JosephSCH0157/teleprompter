export function buildLegacyAsrStateFromStandardScript(canon: string) {
  const w: any = window;

  // 1) remove [note] sections entirely
  let t = canon.replace(/\[note\][\s\S]*?\[\/note\]/gi, '\n');

  // 2) strip speaker markers that sit on their own line
  t = t.replace(/^\[(s1|s2|g1|g2)\]\s*$/gmi, '');
  t = t.replace(/^\[\/(s1|s2|g1|g2)\]\s*$/gmi, '');

  // 3) remove inline style tags like [color=...], [b], [/b], [i], etc.
  t = t.replace(/\[(\/?)(color|bg|b|i|u)(=[^\]]+)?\]/gi, '');

  // 4) collapse pacing cues/pause tags
  t = t.replace(/\[(pause|beat|reflective pause)\]/gi, ' ');

  // 5) normalize whitespace/newlines
  t = t.replace(/\r/g, '').replace(/[ \t]+/g, ' ');

  const scriptWords = t
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const paraIndex: Array<{ start: number; end: number; key: string }> = new Array(scriptWords.length);
  const vParaIndex: string[] = [];
  {
    let wordIdx = 0;
    let lineIdx = 0;
    for (const line of t.split('\n')) {
      const trimmed = String(line || '').trim();
      vParaIndex.push(trimmed);
      const tokens = line
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
      const count = tokens.length;
      if (count > 0) {
        const start = wordIdx;
        const end = wordIdx + count - 1;
        const entry = { start, end, key: line.trim(), line: lineIdx };
        for (let i = start; i <= end; i++) {
          paraIndex[i] = entry;
        }
      }
      wordIdx += count;
      lineIdx += 1;
    }
  }

  w.scriptWords = scriptWords;
  w.paraIndex = paraIndex;
  w.__vParaIndex = vParaIndex;
  w.__tpScriptIndex = {
    scriptWords,
    paraIndex,
    vParaIndex,
    lineCount: vParaIndex.length,
    wordCount: scriptWords.length,
  };
  w.__tpScriptIndexReady = true;
  if (typeof w.currentIndex !== 'number' || Number.isNaN(w.currentIndex)) {
    w.currentIndex = 0;
  }

  try {
    console.log('[ASR] legacy state built', {
      scriptWords: w.scriptWords?.length ?? 0,
      paraIndexEntries: w.paraIndex?.length ?? 0,
      vParaIndex: w.__vParaIndex?.length ?? 0,
      currentIndex: w.currentIndex,
    });
  } catch {}
}
