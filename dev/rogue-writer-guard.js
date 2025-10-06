/* Dev-only guard: block rogue scrollTop/scrollIntoView writes during catchup.
   Loads in DEV only; warns and drops writes if a non-catchup actor mutates scroll during catchup.
*/
(function installRogueWriterGuard(){
  try {
    if (!window.__TP_DEV) return; // dev only
    if (window.__tpRogueGuardInstalled) return; window.__tpRogueGuardInstalled = true;
    const proto = Element.prototype;
    // Guard Element.prototype.scrollTop setter
    try {
      const desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
      if (desc && desc.configurable && desc.set && desc.get){
        Object.defineProperty(proto, 'scrollTop', {
          configurable: true,
          get: desc.get,
          set(v){
            try {
              const allowed = !window.__TP_CATCHUP_ACTIVE || (window.__TP_WRITE_OWNER === 'catchup');
              if (!allowed){
                console.warn('[Rogue scrollTop during catchup]', this, v, new Error().stack);
                return; // Drop the write; alternative: route via SCROLLER.request
              }
            } catch {}
            return desc.set.call(this, v);
          }
        });
      }
    } catch {}
    // Guard Element.prototype.scrollIntoView
    try {
      const origSIV = proto.scrollIntoView;
      if (typeof origSIV === 'function'){
        proto.scrollIntoView = function(){
          try {
            const allowed = !window.__TP_CATCHUP_ACTIVE;
            if (!allowed){ console.warn('[Rogue scrollIntoView during catchup]', this, new Error().stack); return; }
          } catch {}
          return origSIV.apply(this, arguments);
        };
      }
    } catch {}
  } catch {}
})();
