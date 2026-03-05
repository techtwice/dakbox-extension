// DakBox Central Logging — auto-detects dev vs production.
//
// How it works:
//   Chrome Web Store installs → manifest has "update_url" → production → logs OFF
//   Loaded unpacked (dev)     → no "update_url"           → development → logs ON
//
// You can still force a value by setting DAKBOX_FORCE_LOGGING = true/false
// in the browser console before the script runs, e.g. for debugging in prod.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof DAKBOX_LOGGING === 'undefined') {
    const _fromStore = !!(chrome.runtime.getManifest().update_url);
    var DAKBOX_LOGGING = typeof DAKBOX_FORCE_LOGGING !== 'undefined'
        ? DAKBOX_FORCE_LOGGING  // manual override
        : !_fromStore;          // true in dev, false in production

    if (!DAKBOX_LOGGING) {
        ['log', 'warn', 'error'].forEach(m => { console[m] = () => {}; });
    }
}
