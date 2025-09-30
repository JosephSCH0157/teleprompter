// IntersectionObserver-based anchor tracker
// API: createAnchorObserver(getRoot, onUpdate) -> { ensure(), observeAll(nodes), disconnect(), mostVisibleEl() }

const IO_THRESHOLDS = [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1];

export function createAnchorObserver(getRoot, onUpdate){
  let io = null, currentRoot = null;
  const ratios = new Map();
  let most = null;

  function computeMostVisible(){
    let bestEl = most, bestR = bestEl ? (ratios.get(bestEl) || 0) : 0;
    for (const [el, r] of ratios) if (r > bestR) { bestR = r; bestEl = el; }
    most = bestEl || null;
  }

  function ensure(){
    const root = typeof getRoot === 'function' ? getRoot() : null;
    if (!root) { disconnect(); return null; }
    if (io && root === currentRoot) return io;
    disconnect();
    currentRoot = root;
    io = new IntersectionObserver((entries)=>{
      for (const e of entries) ratios.set(e.target, e.intersectionRatio || 0);
      computeMostVisible();
      try { onUpdate && onUpdate(most); } catch {}
    }, { root, threshold: IO_THRESHOLDS });
    return io;
  }

  function observeAll(nodes){
    if (!nodes) return;
    ensure(); if (!io) return;
    ratios.clear(); most = null;
    for (const n of nodes) if (n) io.observe(n);
  }

  function disconnect(){
    try { io && io.disconnect(); } catch {}
    io = null; currentRoot = null; ratios.clear(); most = null;
  }

  return { ensure, observeAll, disconnect, mostVisibleEl: () => most };
}
