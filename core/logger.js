// ─── DakBox Central Logging Switch ───────────────────────────────────────────
// Change the ONE value below to enable or disable ALL console output
// across the entire extension: content scripts, popup, options & background.
//
//   true  → logging ON
//   false → logging OFF  (console.log / warn / error all silenced)
// ─────────────────────────────────────────────────────────────────────────────
const DAKBOX_LOGGING = true;

if (!DAKBOX_LOGGING) {
    ['log', 'warn', 'error'].forEach(m => { console[m] = () => {}; });
}
