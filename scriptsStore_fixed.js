// scriptsStore_fixed.js
// Tiny scripts storage backed by localStorage. Drop-in ES module.
const KEY = 'tp_scripts_v1'; // future-proof key
const MAX = 5;

function _now() {
  return new Date().toISOString();
}
function _read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch (e) {
    console.debug('scriptsStore._read parse failed', e);
    return [];
  }
}
function _write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    console.debug('scriptsStore._write failed', e);
  }
}

const Scripts = {
  init() {
    if (!_read().length) _write([]);
  },
  list() {
    return _read().map(({ id, title, updated }) => ({ id, title, updated }));
  },
  get(id) {
    return _read().find((s) => s.id === id) || null;
  },
  save({ id, title, content }) {
    let list = _read();
    // new or update
    if (!id) {
      // enforce MAX slots (drop oldest)
      if (list.length >= MAX)
        list = list.sort((a, b) => a.updated.localeCompare(b.updated)).slice(1);
      id = crypto.randomUUID?.() || (Date.now() + Math.random()).toString(36);
      list.push({ id, title: title || 'Untitled', content, created: _now(), updated: _now() });
    } else {
      const i = list.findIndex((s) => s.id === id);
      if (i >= 0) {
        list[i] = { ...list[i], title: title ?? list[i].title, content, updated: _now() };
      } else {
        list.push({ id, title: title || 'Untitled', content, created: _now(), updated: _now() });
      }
    }
    _write(list);
    return id;
  },
  rename(id, title) {
    const list = _read();
    const i = list.findIndex((s) => s.id === id);
    if (i >= 0) {
      list[i].title = title;
      list[i].updated = _now();
      _write(list);
    }
  },
  remove(id) {
    _write(_read().filter((s) => s.id !== id));
  },
};

// CommonJS export for environments that don't use ES modules
try {
  if (typeof window !== 'undefined') window.Scripts = Scripts;
} catch (e) {
  void e;
}
// Export as an ES module so dynamic imports receive the Scripts symbol
export { Scripts };
export default Scripts;
