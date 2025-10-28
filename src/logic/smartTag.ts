// src/logic/smartTag.ts
// Pure smartTag logic extracted from monolith. Dependencies (ROLES) are injected for testability.

export type Roles = Record<string, { name?: string } | any>;

export function smartTag(input: string, opts: { keepNames?: boolean; ROLES?: Roles } = {}) {
  const keepNames = opts.keepNames !== false;
  const ROLES = opts.ROLES || ({ s1: {}, s2: {}, g1: {}, g2: {} } as Roles);

  if (/(\[(s1|s2|g1|g2)\])/i.test(input)) return input;

  const lines = String(input || '').split(/\r?\n/);

  const ROLE_KEYS = ['s1', 's2', 'g1', 'g2'];
  const nameToRole = new Map<string, string>();
  for (const key of ROLE_KEYS) {
    const nm = (ROLES[key]?.name || '').trim();
    if (nm) nameToRole.set(nm.toLowerCase(), key);
  }
  const aliasToRole = new Map([
    ['s1', 's1'],
    ['speaker 1', 's1'],
    ['host 1', 's1'],
    ['s2', 's2'],
    ['speaker 2', 's2'],
    ['host 2', 's2'],
    ['g1', 'g1'],
    ['guest 1', 'g1'],
    ['g2', 'g2'],
    ['guest 2', 'g2'],
  ]);

  const resolveRole = (name: string | undefined) => {
    const who = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return nameToRole.get(who) || aliasToRole.get(who) || null;
  };
  const displayNameFor = (role: string, fallback?: string) => (ROLES[role]?.name || fallback || '').trim();

  let currentRole: string | null = null;
  let pendingLabel: string | null = null;
  let paraBuf: string[] = [];
  const out: string[] = [];

  const flush = () => {
    if (!paraBuf.length) return;
    const text = paraBuf.join(' ').trim();
    if (text) {
      if (currentRole) {
        const label = keepNames && pendingLabel ? `[b]${pendingLabel}:[/b] ` : '';
        out.push(`[${currentRole}]${label}${text}[/${currentRole}]`);
      } else {
        out.push(text);
      }
    }
    paraBuf = [];
    pendingLabel = null;
  };

  for (const raw of lines) {
    const s = raw.trim();

    const block = s.match(/^>{1,2}\s*([^:>\-—()]+?)\s*[:>\-—]\s*$/i);
    if (block) {
      flush();
      const name = block[1];
      const role = resolveRole(name);
      currentRole = role;
      pendingLabel = role && keepNames ? displayNameFor(role, name) : null;
      continue;
    }

    const inline = raw.match(/^\s*([^:>\-—()]+?)(?:\s*\((off[-\s]?script)\))?\s*[:>\-—]\s*(.+)$/i);
    if (inline) {
      flush();
      const who = inline[1];
      const body = inline[3].trim();
      const role = resolveRole(who);
      if (role) {
        const show = keepNames ? `[b]${displayNameFor(role, who)}:[/b] ` : '';
        out.push(`[${role}]${show}${body}[/${role}]`);
        currentRole = role;
        pendingLabel = null;
        continue;
      }
    }

    if (!s) {
      flush();
      out.push('');
      continue;
    }

    paraBuf.push(s);
  }

  flush();
  return out.join('\n');
}

export default smartTag;
