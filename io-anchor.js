// IntersectionObserver-based anchor tracker
// Creates a dense-threshold observer rooted to the provided scroller element.
// Returns { observeAll(paragraphs), mostVisibleEl(), disconnect() }

const IO_THRESHOLDS = [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1];

export function createAnchorObserver(getRoot, onUpdate){
  let io = null;
  const ratios = new Map();
  let most = null;

  function computeMostVisible(){
    let bestEl = most, bestR = bestEl ? (ratios.get(bestEl)||0) : 0;
    for (const [el, r] of ratios){ if (r > bestR){ bestR = r; bestEl = el; } }
    most = bestEl;
  }

  function ensure(){
    // Resolve root via provided getter; honor null for window viewport
    const root = (typeof getRoot === 'function') ? getRoot() : null;
    if (!root) return;
    if (io) io.disconnect();
    ratios.clear(); most = null;
    try {
      io = new IntersectionObserver((entries)=>{
        for (const e of entries){ ratios.set(e.target, e.intersectionRatio || 0); }
        computeMostVisible();
        try { onUpdate && onUpdate(most); } catch {}
      }, { root, threshold: IO_THRESHOLDS });
    } catch { io = null; }
  }

  function observeAll(nodes){ if (!io) ensure(); if (!io) return; for (const n of nodes) io.observe(n); }
  function disconnect(){ try { io && io.disconnect(); } catch {} }
  function mostVisibleEl(){ return most; }

  return { ensure, observeAll, disconnect, mostVisibleEl };
}
