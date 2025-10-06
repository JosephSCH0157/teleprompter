// Dev-only: freeze programmatic scrolling and log untagged writers
// Enable by running: window.__TP_FREEZE = true; then dynamically import this file
(function(){
  try {
    if (!window.__TP_DEV) return;
    if (window.__tpFreezeProbeInstalled) return; window.__tpFreezeProbeInstalled = true;
    const NOP = ()=>{};
    const log = (...a)=>console.warn('[FREEZE]', ...a);

    // Mark scroller writes (controller should also set this)
    try { if (!window.__TP_LAST_WRITE) window.__TP_LAST_WRITE = { tag:'', t:0 }; } catch {}

    const _wST = window.scrollTo?.bind(window);
    const _wSB = window.scrollBy?.bind(window);
    window.scrollTo = function(){ log('window.scrollTo blocked', arguments); };
    window.scrollBy = function(){ log('window.scrollBy blocked', arguments); };

    const proto = Element.prototype;
    const _eST = proto.scrollTo;
    const _eSB = proto.scrollBy;
    const _eSIV = proto.scrollIntoView;
    proto.scrollTo = function(){ log('el.scrollTo blocked', this); };
    proto.scrollBy = function(){ log('el.scrollBy blocked', this); };
    proto.scrollIntoView = function(){ log('el.scrollIntoView blocked', this); };

    const _focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function(opts){
      if (window.__TP_FREEZE){
        log('focus blocked', this);
        try { _focus.call(this, { preventScroll: true }); } catch {}
        return;
      }
      return _focus.call(this, Object.assign({}, (opts||{}), { preventScroll: true }));
    };

    const _sel = (document.getSelection && document.getSelection.bind(document)) || null;
    document.addEventListener('selectionchange', ()=>{
      if (window.__TP_FREEZE) console.warn('[FREEZE] selectionchange');
    }, true);

    let lastTop = -1;
    document.addEventListener('scroll', (e)=>{
      const v = document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body;
      if (!v) return;
      const y = (v===window) ? (window.scrollY||0) : (v.scrollTop||0);
      if (y !== lastTop){
        const tagged = performance.now() - ((window.__TP_LAST_WRITE && window.__TP_LAST_WRITE.t) || 0) < 60;
        if (window.__TP_FREEZE || !tagged){
          console.warn('[FREEZE] untagged scroll delta', { from:lastTop, to:y, target:e.target, lastWrite: window.__TP_LAST_WRITE });
        }
        lastTop = y;
      }
    }, true);

    window.__TP_FREEZE_RESTORE = function(){
      try {
        if (_wST) window.scrollTo = _wST; if (_wSB) window.scrollBy = _wSB;
        if (_eST) proto.scrollTo = _eST; if (_eSB) proto.scrollBy = _eSB; if (_eSIV) proto.scrollIntoView = _eSIV;
        HTMLElement.prototype.focus = _focus;
        log('restored');
      } catch {}
    };
  } catch {}
})();
