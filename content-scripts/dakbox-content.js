/**
 * DakBox Content Script - dakbox.net
 * Enhances the DakBox temporary email inbox with OTP extraction,
 * quick-copy functionality, and visual improvements
 */

(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.__dakbox_extension_loaded) return;
    window.__dakbox_extension_loaded = true;

    console.log('[DakBox Extension] Content script loaded on dakbox.net');

    // ─────────────────────────────────────────────
    // OTP Extraction Utilities
    // ─────────────────────────────────────────────

    /**
     * Extract OTP code from email content text
     * Supports 4-6 digit numeric codes commonly used in verification
     */
    function extractOtpFromText(text) {
        if (!text) return null;

        // Common OTP patterns:
        // "Your verification code is: 123456"
        // "OTP: 1234"
        // "Code: 567890"
        // "verification code 123456"
        const patterns = [
            /(?:verification\s*code|otp|code|pin)\s*(?:is)?[:\s]+(\d{4,6})/i,
            /(\d{4,6})\s*(?:is\s+your|verification|otp|code)/i,
            /\b(\d{6})\b/,  // Fallback: any 6-digit number
            /\b(\d{4})\b/   // Fallback: any 4-digit number
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    // ─────────────────────────────────────────────
    // Floating OTP Panel
    // ─────────────────────────────────────────────

    function createOtpPanel() {
        // Remove existing panel if any
        const existing = document.getElementById('dakbox-ext-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'dakbox-ext-panel';
        panel.innerHTML = `
      <style>
        #dakbox-ext-panel {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 320px;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 20px;
          z-index: 999999;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          color: #e0e0e0;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }
        #dakbox-ext-panel:hover {
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
          transform: translateY(-2px);
        }
        #dakbox-ext-panel .ext-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        #dakbox-ext-panel .ext-title {
          font-size: 15px;
          font-weight: 700;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #dakbox-ext-panel .ext-title .icon {
          font-size: 18px;
        }
        #dakbox-ext-panel .ext-badge {
          background: linear-gradient(135deg, #e94560, #c23152);
          color: white;
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 20px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        #dakbox-ext-panel .ext-close {
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #888;
          font-size: 16px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        #dakbox-ext-panel .ext-close:hover {
          background: rgba(233, 69, 96, 0.3);
          color: #e94560;
        }
        #dakbox-ext-panel .ext-email-display {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 14px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #dakbox-ext-panel .ext-email-display .email-icon {
          font-size: 16px;
        }
        #dakbox-ext-panel .ext-email-text {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #a8d8ea;
          font-weight: 500;
        }
        #dakbox-ext-panel .ext-copy-btn {
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ccc;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          transition: all 0.2s;
          white-space: nowrap;
        }
        #dakbox-ext-panel .ext-copy-btn:hover {
          background: rgba(168, 216, 234, 0.2);
          color: #a8d8ea;
          border-color: rgba(168, 216, 234, 0.3);
        }
        #dakbox-ext-panel .ext-otp-section {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 12px;
        }
        #dakbox-ext-panel .ext-otp-label {
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
          font-weight: 600;
        }
        #dakbox-ext-panel .ext-otp-code {
          font-size: 28px;
          font-weight: 800;
          color: #4ecca3;
          letter-spacing: 6px;
          text-align: center;
          font-family: 'Courier New', monospace;
          padding: 8px 0;
          text-shadow: 0 0 20px rgba(78, 204, 163, 0.3);
        }
        #dakbox-ext-panel .ext-otp-empty {
          text-align: center;
          color: #666;
          font-size: 13px;
          padding: 10px 0;
        }
        #dakbox-ext-panel .ext-fetch-btn {
          cursor: pointer;
          background: linear-gradient(135deg, #4ecca3, #38b2ac);
          border: none;
          color: white;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          width: 100%;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        #dakbox-ext-panel .ext-fetch-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(78, 204, 163, 0.3);
        }
        #dakbox-ext-panel .ext-fetch-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        #dakbox-ext-panel .ext-status {
          text-align: center;
          font-size: 11px;
          color: #888;
          margin-top: 10px;
          min-height: 16px;
        }
        #dakbox-ext-panel .ext-status.success { color: #4ecca3; }
        #dakbox-ext-panel .ext-status.error { color: #e94560; }
        #dakbox-ext-panel .ext-minimized {
          display: none;
        }
        #dakbox-ext-panel.minimized .ext-body {
          display: none;
        }
        #dakbox-ext-panel.minimized {
          width: auto;
          padding: 12px 16px;
          cursor: pointer;
        }
      </style>
      <div class="ext-header">
        <div class="ext-title">
          <span class="icon">📬</span>
          DakBox Helper
          <span class="ext-badge">EXT</span>
        </div>
        <button class="ext-close" id="dakbox-ext-close" title="Minimize">─</button>
      </div>
      <div class="ext-body">
        <div class="ext-email-display">
          <span class="email-icon">📧</span>
          <span class="ext-email-text" id="dakbox-ext-email">Detecting email...</span>
          <button class="ext-copy-btn" id="dakbox-ext-copy-email" title="Copy email">Copy</button>
        </div>
        <div class="ext-otp-section">
          <div class="ext-otp-label">Latest OTP Code</div>
          <div id="dakbox-ext-otp-display" class="ext-otp-empty">No OTP detected yet</div>
        </div>
        <button class="ext-fetch-btn" id="dakbox-ext-fetch-otp">
          🔑 Fetch OTP from API
        </button>
        <div class="ext-status" id="dakbox-ext-status"></div>
      </div>
    `;

        document.body.appendChild(panel);
        setupPanelEvents(panel);
        detectCurrentEmail();
    }

    // ─────────────────────────────────────────────
    // Panel Event Handlers
    // ─────────────────────────────────────────────

    function setupPanelEvents(panel) {
        // Minimize/expand
        const closeBtn = panel.querySelector('#dakbox-ext-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('minimized');
        });

        panel.addEventListener('click', () => {
            if (panel.classList.contains('minimized')) {
                panel.classList.remove('minimized');
            }
        });

        // Copy email
        const copyBtn = panel.querySelector('#dakbox-ext-copy-email');
        copyBtn.addEventListener('click', () => {
            const emailEl = panel.querySelector('#dakbox-ext-email');
            const email = emailEl.textContent;
            if (email && email !== 'Detecting email...') {
                navigator.clipboard.writeText(email).then(() => {
                    copyBtn.textContent = '✓ Copied';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                });
            }
        });

        // Fetch OTP
        const fetchBtn = panel.querySelector('#dakbox-ext-fetch-otp');
        fetchBtn.addEventListener('click', async () => {
            const emailEl = panel.querySelector('#dakbox-ext-email');
            const email = emailEl.textContent;

            if (!email || email === 'Detecting email...') {
                setStatus('No email detected', 'error');
                return;
            }

            const username = email.replace(/@dakbox\.net$/i, '');
            fetchBtn.disabled = true;
            fetchBtn.textContent = '⏳ Fetching...';
            setStatus('Connecting to OTP API...');

            try {
                const result = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                        { action: 'fetchOtp', username },
                        resolve
                    );
                });

                if (result && result.success && result.otp) {
                    displayOtp(result.otp);
                    setStatus(`OTP fetched! Expires in ${result.remaining_seconds || '?'}s`, 'success');

                    // Save username for popup quick access
                    chrome.storage.local.set({ dakboxLastUsername: username });
                } else {
                    setStatus(result?.error || 'Failed to fetch OTP', 'error');
                }
            } catch (error) {
                setStatus('Error: ' + error.message, 'error');
            }

            fetchBtn.disabled = false;
            fetchBtn.textContent = '🔑 Fetch OTP from API';
        });
    }

    // ─────────────────────────────────────────────
    // Helper Functions
    // ─────────────────────────────────────────────

    function displayOtp(otp) {
        const display = document.getElementById('dakbox-ext-otp-display');
        if (!display) return;

        display.className = 'ext-otp-code';
        display.textContent = otp;
        display.style.cursor = 'pointer';
        display.title = 'Click to copy';
        display.onclick = () => {
            navigator.clipboard.writeText(otp).then(() => {
                setStatus('OTP copied to clipboard!', 'success');
            });
        };
    }

    function setStatus(message, type = '') {
        const status = document.getElementById('dakbox-ext-status');
        if (status) {
            status.textContent = message;
            status.className = 'ext-status' + (type ? ' ' + type : '');
        }
    }

    function detectCurrentEmail() {
        const emailEl = document.getElementById('dakbox-ext-email');
        if (!emailEl) return;

        // Try to detect the email from the dakbox.net page
        // Method 1: Check URL pattern /go/{username}
        const urlMatch = window.location.pathname.match(/\/go\/([^/?#]+)/);
        if (urlMatch) {
            const username = urlMatch[1];
            emailEl.textContent = `${username}@dakbox.net`;
            return;
        }

        // Method 2: Scan page for email display elements
        const allElements = document.querySelectorAll('input, span, div, p, h1, h2, h3, h4, h5, td');
        for (const el of allElements) {
            const text = (el.value || el.textContent || '').trim();
            const emailMatch = text.match(/([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (emailMatch) {
                emailEl.textContent = emailMatch[1];
                return;
            }
        }

        // Method 3: Use a MutationObserver to detect email appearing later
        emailEl.textContent = 'Scanning for email...';
        const observer = new MutationObserver(() => {
            const elements = document.querySelectorAll('input, span, div, p, td');
            for (const el of elements) {
                const text = (el.value || el.textContent || '').trim();
                const match = text.match(/([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
                if (match) {
                    emailEl.textContent = match[1];
                    observer.disconnect();
                    return;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        setTimeout(() => observer.disconnect(), 30000);
    }

    // ─────────────────────────────────────────────
    // Auto-detect OTP in Incoming Emails
    // ─────────────────────────────────────────────

    function setupEmailObserver() {
        const observer = new MutationObserver(() => {
            // Look for email content that might contain OTP codes
            const emailBodies = document.querySelectorAll('.email-body, .message-body, .email-content, [class*="email"], [class*="message"]');

            for (const body of emailBodies) {
                const text = body.textContent;
                const otp = extractOtpFromText(text);
                if (otp) {
                    displayOtp(otp);
                    setStatus('OTP auto-detected from email!', 'success');

                    // Auto-copy to clipboard
                    navigator.clipboard.writeText(otp).catch(() => { });
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ─────────────────────────────────────────────
    // Initialize
    // ─────────────────────────────────────────────

    function init() {
        // Wait for page to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                createOtpPanel();
                setupEmailObserver();
            });
        } else {
            createOtpPanel();
            setupEmailObserver();
        }
    }

    init();

})();
