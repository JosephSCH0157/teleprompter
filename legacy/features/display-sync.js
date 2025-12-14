export function installDisplaySync(opts) {
    const chanName = opts.channelName ?? 'tp_display';
    let chan = null;
    try {
        chan = new BroadcastChannel(chanName);
    }
    catch {
        chan = null;
    }
    let ver = 0;
    let lastHash = '';
    let scheduled = false;
    const safeHash = (s) => {
        // tiny FNV-1a (uint32)
        let h = 0x811c9dc5 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            // h *= 16777619; via shifts to stay in 32-bit
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return (h >>> 0).toString(16);
    };
    const post = (snap) => {
        // BroadcastChannel (fast) + postMessage (display window fallback)
        try {
            chan?.postMessage(snap);
        }
        catch { }
        try {
            const w = opts.getDisplayWindow?.();
            w?.postMessage?.(snap, '*');
        }
        catch { }
    };
    const schedulePush = () => {
        if (scheduled)
            return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try {
                const text = opts.getText?.() ?? '';
                const hash = safeHash(text);
                const anchor = opts.getAnchorRatio?.();
                if (hash === lastHash) {
                    // still let the display know anchor moved (no heavy payload)
                    post({ kind: 'tp:script', source: 'main', version: ver, textHash: hash, anchorRatio: anchor });
                    return;
                }
                lastHash = hash;
                ver++;
                post({ kind: 'tp:script', source: 'main', version: ver, textHash: hash, text, anchorRatio: anchor });
            }
            catch { }
        });
    };
    // MAIN window: listen for editor/script change events
    const onLocalChange = () => schedulePush();
    window.addEventListener('tp:scriptChanged', onLocalChange);
    window.addEventListener('tp:anchorChanged', onLocalChange);
    // DISPLAY window: accept updates (if used in display context too)
    const onMsg = (evt) => {
        try {
            const msg = evt.data;
            if (!msg || msg.kind !== 'tp:script' || msg.source === 'display')
                return;
            if (msg.text && typeof opts.onApplyRemote === 'function') {
                opts.onApplyRemote(msg.text, msg);
            }
            // optional: use msg.anchorRatio to adjust scroll externally
        }
        catch { }
    };
    const onChan = (e) => {
        try {
            onMsg({ data: e.data });
        }
        catch { }
    };
    try {
        window.addEventListener('message', onMsg);
    }
    catch { }
    try {
        chan?.addEventListener('message', onChan);
    }
    catch { }
    // initial push
    try {
        schedulePush();
    }
    catch { }
    return () => {
        try {
            window.removeEventListener('tp:scriptChanged', onLocalChange);
        }
        catch { }
        try {
            window.removeEventListener('tp:anchorChanged', onLocalChange);
        }
        catch { }
        try {
            window.removeEventListener('message', onMsg);
        }
        catch { }
        try {
            chan?.removeEventListener('message', onChan);
        }
        catch { }
        try {
            chan?.close();
        }
        catch { }
    };
}
export default installDisplaySync;
