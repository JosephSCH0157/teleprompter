// Simple encoding guard: fails on smart punctuation / replacement chars in source files.
// Keeps the codebase ASCII-clean to avoid mojibake when encodings drift.
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BAD_RE = /[…—–“”’→➜�]/g; // ellipsis, em/en dash, curly quotes, arrows, replacement char
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.ts', '.md', '.json']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.worktrees', '.vscode', 'artifacts', 'releases']);

const hits = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!ALLOWED_EXT.has(ext)) continue;
    const data = fs.readFileSync(full, 'utf8');
    let m;
    while ((m = BAD_RE.exec(data)) !== null) {
      const before = Math.max(0, m.index - 15);
      const after = m.index + 15;
      hits.push({
        file: path.relative(ROOT, full),
        index: m.index,
        char: m[0],
        context: data.slice(before, after).replace(/\n/g, '\\n'),
      });
    }
  }
}

walk(ROOT);

if (hits.length) {
  console.error(`Bad characters detected (${hits.length}):`);
  for (const hit of hits) {
    console.error(`- ${hit.file} @${hit.index}: "${hit.char}" ...${hit.context}...`);
  }
  process.exit(1);
}
