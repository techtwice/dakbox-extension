/**
 * DakBox Extension Popup Script
 * Handles popup UI interactions, OTP fetching, and settings management
 */

document.addEventListener('DOMContentLoaded', () => {
    // ─────────────────────────────────────────────
    // Element References
    // ─────────────────────────────────────────────

    const usernameInput = document.getElementById('username-input');
    const usernamePreview = document.getElementById('username-preview');
    const openInboxBtn = document.getElementById('open-inbox-btn');
    const fetchLoginOtpBtn = document.getElementById('fetch-login-otp-btn');
    const fetchRegOtpBtn = document.getElementById('fetch-reg-otp-btn');
    const otpDisplay = document.getElementById('otp-display');
    const statusText = document.getElementById('status-text');
    const toggleAutoOtp = document.getElementById('toggle-auto-otp');
    const toggleAutoOpen = document.getElementById('toggle-auto-open');
    const versionBadge = document.getElementById('version-badge');

    // ─────────────────────────────────────────────
    // Initialize
    // ─────────────────────────────────────────────

    // Set version
    const manifest = chrome.runtime.getManifest();
    versionBadge.textContent = `v${manifest.version}`;

    // Load saved settings
    chrome.storage.local.get([
        'dakboxAutoOtpEnabled',
        'dakboxAutoOpenInbox',
        'dakboxLastUsername'
    ], (data) => {
        toggleAutoOtp.checked = data.dakboxAutoOtpEnabled !== false;
        toggleAutoOpen.checked = data.dakboxAutoOpenInbox !== false;
        if (data.dakboxLastUsername) {
            usernameInput.value = data.dakboxLastUsername;
            usernamePreview.textContent = data.dakboxLastUsername;
        }
    });

    // ─────────────────────────────────────────────
    // Username Input Handling
    // ─────────────────────────────────────────────

    usernameInput.addEventListener('input', () => {
        const val = usernameInput.value.trim();
        usernamePreview.textContent = val || 'username';

        // Save for quick access
        if (val) {
            chrome.storage.local.set({ dakboxLastUsername: val });
        }
    });

    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            openInboxBtn.click();
        }
    });

    // ─────────────────────────────────────────────
    // Open Inbox
    // ─────────────────────────────────────────────

    openInboxBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (!username) {
            setStatus('Please enter a username', 'error');
            usernameInput.focus();
            return;
        }

        const url = `https://dakbox.net/go/${username}`;
        chrome.tabs.create({ url: url });
        setStatus(`Opening inbox for ${username}...`, 'success');
    });

    // ─────────────────────────────────────────────
    // Fetch Login OTP
    // ─────────────────────────────────────────────

    fetchLoginOtpBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) {
            setStatus('Please enter a username first', 'error');
            usernameInput.focus();
            return;
        }

        fetchLoginOtpBtn.disabled = true;
        fetchRegOtpBtn.disabled = true;
        fetchLoginOtpBtn.innerHTML = '<span class="btn-icon">⏳</span> Fetching...';
        setStatus('Connecting to OTP API...', 'loading');

        try {
            const result = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'fetchOtp', username: username },
                    resolve
                );
            });

            if (result && result.success && result.otp) {
                showOtp(result.otp);
                const remaining = result.remaining_seconds ? ` (${result.remaining_seconds}s left)` : '';
                setStatus(`Login OTP fetched successfully!${remaining}`, 'success');
            } else {
                setStatus(result?.error || 'Failed to fetch OTP', 'error');
            }
        } catch (error) {
            setStatus('Error: ' + error.message, 'error');
        }

        fetchLoginOtpBtn.disabled = false;
        fetchRegOtpBtn.disabled = false;
        fetchLoginOtpBtn.innerHTML = '<span class="btn-icon">🔓</span> Get OTP';
    });

    // ─────────────────────────────────────────────
    // Fetch Registration OTP
    // ─────────────────────────────────────────────

    fetchRegOtpBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) {
            setStatus('Please enter a username first', 'error');
            usernameInput.focus();
            return;
        }

        fetchLoginOtpBtn.disabled = true;
        fetchRegOtpBtn.disabled = true;
        fetchRegOtpBtn.innerHTML = '<span class="btn-icon">⏳</span> Fetching...';
        setStatus('Connecting to verification API...', 'loading');

        try {
            const result = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'fetchRegistrationOtp', username: username },
                    resolve
                );
            });

            if (result && result.success && result.otp) {
                showOtp(result.otp);
                const remaining = result.remaining_seconds ? ` (${result.remaining_seconds}s left)` : '';
                setStatus(`Registration OTP fetched!${remaining}`, 'success');
            } else {
                setStatus(result?.error || 'Failed to fetch OTP', 'error');
            }
        } catch (error) {
            setStatus('Error: ' + error.message, 'error');
        }

        fetchLoginOtpBtn.disabled = false;
        fetchRegOtpBtn.disabled = false;
        fetchRegOtpBtn.innerHTML = '<span class="btn-icon">📝</span> Registration OTP';
    });

    // ─────────────────────────────────────────────
    // Settings Toggles
    // ─────────────────────────────────────────────

    toggleAutoOtp.addEventListener('change', () => {
        chrome.storage.local.set({ dakboxAutoOtpEnabled: toggleAutoOtp.checked });
        setStatus(`Auto OTP ${toggleAutoOtp.checked ? 'enabled' : 'disabled'}`, 'success');
    });

    toggleAutoOpen.addEventListener('change', () => {
        chrome.storage.local.set({ dakboxAutoOpenInbox: toggleAutoOpen.checked });
        setStatus(`Auto open ${toggleAutoOpen.checked ? 'enabled' : 'disabled'}`, 'success');
    });

    // ─────────────────────────────────────────────
    // Helper Functions
    // ─────────────────────────────────────────────

    function showOtp(otp) {
        otpDisplay.innerHTML = `<span class="otp-code" title="Click to copy">${otp}</span>`;
        otpDisplay.classList.add('has-otp');

        // Click to copy
        otpDisplay.querySelector('.otp-code').addEventListener('click', () => {
            navigator.clipboard.writeText(otp).then(() => {
                setStatus('OTP copied to clipboard!', 'success');
            });
        });
    }

    function setStatus(message, type = '') {
        statusText.textContent = message;
        statusText.className = 'status-text' + (type ? ' ' + type : '');

        // Auto-clear after 5 seconds
        if (type !== 'loading') {
            setTimeout(() => {
                if (statusText.textContent === message) {
                    statusText.textContent = '';
                    statusText.className = 'status-text';
                }
            }, 5000);
        }
    }
});
