/**
 * DakBox Extension Popup Script
 * Handles popup UI interactions, API connection, OTP fetching, and settings management
 */

document.addEventListener('DOMContentLoaded', () => {
    // ─────────────────────────────────────────────
    // Element References
    // ─────────────────────────────────────────────

    // Views
    const apiSetupView = document.getElementById('api-setup-view');
    const connectedView = document.getElementById('connected-view');

    // API Setup
    const apiTokenInput = document.getElementById('api-token-input');
    const connectApiBtn = document.getElementById('connect-api-btn');
    const apiStatusText = document.getElementById('api-status-text');

    // Plan Info
    const planType = document.getElementById('plan-type');
    const planExpires = document.getElementById('plan-expires');
    const planEmail = document.getElementById('plan-email');
    const planOtpUsage = document.getElementById('plan-otp-usage');
    const planAutoOpens = document.getElementById('plan-auto-opens');
    const disconnectBtn = document.getElementById('disconnect-btn');

    // Connected view elements
    const usernameInput = document.getElementById('username-input');
    const usernamePreview = document.getElementById('username-preview');
    const openInboxBtn = document.getElementById('open-inbox-btn');
    const fetchLoginOtpBtn = document.getElementById('fetch-login-otp-btn');
    const fetchRegOtpBtn = document.getElementById('fetch-reg-otp-btn');
    const otpDisplay = document.getElementById('otp-display');
    const statusText = document.getElementById('status-text');
    const toggleAutoOtp = document.getElementById('toggle-auto-otp');
    const toggleAutoOpen = document.getElementById('toggle-auto-open');
    const toggleAutoYopmail = document.getElementById('toggle-auto-yopmail');
    const toggleAutoGenerate = document.getElementById('toggle-auto-generate');
    const requestSiteBtn = document.getElementById('request-site-btn');
    const openOptionsBtn = document.getElementById('open-options-btn');
    const versionBadge = document.getElementById('version-badge');

    // ─────────────────────────────────────────────
    // Initialize
    // ─────────────────────────────────────────────

    const manifest = chrome.runtime.getManifest();
    versionBadge.textContent = `v${manifest.version}`;

    // Check if API token is already saved
    chrome.storage.local.get({
        'dakboxApiToken': '',
        'dakboxUserInfo': null,
        'dakboxAutoOtpEnabled': true,
        'dakboxAutoOpenInbox': false,
        'dakboxAutoOpenYopmail': true,
        'dakboxAutoGenerate': true,
        'dakboxLastUsername': '',
        'dakboxAutoOpenCount': 0,
        'dakboxAutoOpenMonthKey': ''
    }, (data) => {
        toggleAutoOtp.checked = data.dakboxAutoOtpEnabled === true;
        toggleAutoOpen.checked = data.dakboxAutoOpenInbox === true;
        toggleAutoYopmail.checked = data.dakboxAutoOpenYopmail === true;
        toggleAutoGenerate.checked = data.dakboxAutoGenerate === true;

        if (data.dakboxLastUsername) {
            usernameInput.value = data.dakboxLastUsername;
            usernamePreview.textContent = data.dakboxLastUsername;
        }

        if (data.dakboxApiToken) {
            // Token exists - show connected view
            showConnectedView(data.dakboxUserInfo);
            refreshAutoOpens(data.dakboxUserInfo, data.dakboxAutoOpenCount, data.dakboxAutoOpenMonthKey);
            // Refresh user info in background
            verifyToken(data.dakboxApiToken, true);
        } else {
            // No token - show API setup
            showApiSetupView();
        }
    });

    // ─────────────────────────────────────────────
    // View Switching
    // ─────────────────────────────────────────────

    function showApiSetupView() {
        apiSetupView.style.display = 'block';
        connectedView.style.display = 'none';
    }

    function showConnectedView(userInfo) {
        apiSetupView.style.display = 'none';
        connectedView.style.display = 'block';

        if (userInfo) {
            planType.textContent = userInfo.planName || '—';
            planType.className = 'plan-value plan-badge plan-' + (userInfo.planType || 'free').toLowerCase();
            planExpires.textContent = userInfo.expiresAt ? formatDate(userInfo.expiresAt) : '—';
            planEmail.textContent = userInfo.email || '—';
            if (userInfo.otpUsed !== undefined && userInfo.otpTotal !== undefined) {
                planOtpUsage.textContent = `${userInfo.otpUsed} / ${userInfo.otpTotal}`;
                planOtpUsage.title = `${userInfo.otpRemaining} remaining`;
            } else {
                planOtpUsage.textContent = '—';
            }
        }
    }

    function formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    }

    /**
     * Reads the auto-open counter from storage and renders it in the plan section.
     * @param {object} userInfo  - stored user info (planStatus used to detect Premium)
     * @param {number} count     - raw count from storage
     * @param {string} monthKey  - stored month key (YYYY-MM)
     */
    function refreshAutoOpens(userInfo, count, monthKey) {
        if (!planAutoOpens) return;

        // Reset count if it's a new month
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const effectiveCount = (monthKey === currentMonthKey) ? (count || 0) : 0;

        const isPremium = userInfo && userInfo.planStatus === 'active' && !userInfo.planName?.toLowerCase().includes('free');
        const FREE_LIMIT = 1;

        if (isPremium) {
            planAutoOpens.textContent = `${effectiveCount} / ∞`;
            planAutoOpens.style.color = '';
        } else {
            planAutoOpens.textContent = `${effectiveCount} / ${FREE_LIMIT}`;
            // Red tint when at or near limit
            planAutoOpens.style.color = effectiveCount >= FREE_LIMIT ? '#e94560'
                : effectiveCount >= FREE_LIMIT * 0.8 ? '#faad14' : '';
        }
    }

    // ─────────────────────────────────────────────
    // API Connection
    // ─────────────────────────────────────────────

    connectApiBtn.addEventListener('click', async () => {
        const token = apiTokenInput.value.trim();
        if (!token) {
            setApiStatus('Please enter your API token', 'error');
            apiTokenInput.focus();
            return;
        }

        connectApiBtn.disabled = true;
        connectApiBtn.innerHTML = '<span class="btn-icon">⏳</span>';
        setApiStatus('Connecting to DakBox API...', 'loading');

        await verifyToken(token, false);

        connectApiBtn.disabled = false;
        connectApiBtn.innerHTML = '<span class="btn-icon">🔗</span>';
    });

    apiTokenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') connectApiBtn.click();
    });

    async function verifyToken(token, silent) {
        try {
            const response = await fetch('https://dakbox.net/api/user', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                if (!silent) setApiStatus('Failed to parse API response', 'error');
                return;
            }

            // Handle disabled/invalid API key
            if (data.error) {
                console.warn('[DakBox] API error:', data.error);
                // Clear saved token — force re-entry
                chrome.storage.local.remove(['dakboxApiToken', 'dakboxUserInfo']);
                showApiSetupView();
                setApiStatus(data.error, 'error');
                return;
            }

            if (!response.ok) {
                const errMsg = response.status === 401 ? 'Invalid or expired token' : `Error: ${response.status}`;
                // Clear saved token on auth failure
                chrome.storage.local.remove(['dakboxApiToken', 'dakboxUserInfo']);
                showApiSetupView();
                setApiStatus(errMsg, 'error');
                return;
            }

            if (data.user) {
                const userInfo = {
                    email: data.user.email,
                    name: data.user.name,
                    planName: data.plan?.name || 'Unknown',
                    planType: data.plan?.type || 'Free',
                    planStatus: data.plan?.status || 'unknown',
                    expiresAt: data.plan?.expires_at || null,
                    otpTotal: data.otp_helper?.total ?? null,
                    otpUsed: data.otp_helper?.used ?? null,
                    otpRemaining: data.otp_helper?.remaining ?? null
                };

                // Save token and user info
                chrome.storage.local.set({
                    dakboxApiToken: token,
                    dakboxUserInfo: userInfo
                });

                showConnectedView(userInfo);
                // Refresh auto-open counter display
                chrome.storage.local.get(['dakboxAutoOpenCount', 'dakboxAutoOpenMonthKey'], (c) => {
                    refreshAutoOpens(userInfo, c.dakboxAutoOpenCount, c.dakboxAutoOpenMonthKey);
                });
                if (!silent) setApiStatus('Connected successfully!', 'success');
            } else {
                if (!silent) setApiStatus('Invalid response from API', 'error');
            }
        } catch (error) {
            if (!silent) setApiStatus('Connection failed: ' + error.message, 'error');
        }
    }

    // ─────────────────────────────────────────────
    // Disconnect
    // ─────────────────────────────────────────────

    disconnectBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['dakboxApiToken', 'dakboxUserInfo'], () => {
            apiTokenInput.value = '';
            showApiSetupView();
            setApiStatus('Disconnected', 'success');
        });
    });

    // ─────────────────────────────────────────────
    // Username Input Handling
    // ─────────────────────────────────────────────

    usernameInput.addEventListener('input', () => {
        const val = usernameInput.value.trim();
        usernamePreview.textContent = val || 'username';
        if (val) chrome.storage.local.set({ dakboxLastUsername: val });
    });

    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openInboxBtn.click();
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
        chrome.tabs.create({ url: `https://dakbox.net/go/${username}` });
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
                setStatus(`OTP fetched successfully!${remaining}`, 'success');
            } else {
                const errMsg = result?.error || 'Failed to fetch OTP';
                if (result?.isSubscriptionError) {
                    alert(`⚠️ DakBox — Subscription Error\n\n${errMsg}`);
                }
                setStatus(errMsg, 'error');
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
                const errMsg = result?.error || 'Failed to fetch OTP';
                if (result?.isSubscriptionError) {
                    alert(`⚠️ DakBox — Subscription Error\n\n${errMsg}`);
                }
                setStatus(errMsg, 'error');
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
        setStatus(`Auto open DakBox ${toggleAutoOpen.checked ? 'enabled' : 'disabled'}`, 'success');
    });

    toggleAutoYopmail.addEventListener('change', () => {
        chrome.storage.local.set({ dakboxAutoOpenYopmail: toggleAutoYopmail.checked });
        setStatus(`Auto open Yopmail ${toggleAutoYopmail.checked ? 'enabled' : 'disabled'}`, 'success');
    });

    toggleAutoGenerate.addEventListener('change', () => {
        chrome.storage.local.set({ dakboxAutoGenerate: toggleAutoGenerate.checked });
        setStatus(`Auto Random Email ${toggleAutoGenerate.checked ? 'enabled' : 'disabled'}`, 'success');
    });

    requestSiteBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://dakbox.net/post/help-us-expand-dakbox-suggest-websites-for-seamless-otp-automation' });
    });

    if (openOptionsBtn) {
        openOptionsBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('ui/options.html'));
            }
        });
    }

    // ─────────────────────────────────────────────
    // Helper Functions
    // ─────────────────────────────────────────────

    function showOtp(otp) {
        otpDisplay.innerHTML = `<span class="otp-code" title="Click to copy">${otp}</span>`;
        otpDisplay.classList.add('has-otp');
        otpDisplay.querySelector('.otp-code').addEventListener('click', () => {
            navigator.clipboard.writeText(otp).then(() => {
                setStatus('OTP copied to clipboard!', 'success');
            });
        });
    }

    function setStatus(message, type = '') {
        statusText.textContent = message;
        statusText.className = 'status-text' + (type ? ' ' + type : '');
        if (type !== 'loading') {
            setTimeout(() => {
                if (statusText.textContent === message) {
                    statusText.textContent = '';
                    statusText.className = 'status-text';
                }
            }, 5000);
        }
    }

    function setApiStatus(message, type = '') {
        apiStatusText.textContent = message;
        apiStatusText.className = 'status-text' + (type ? ' ' + type : '');
        if (type !== 'loading') {
            setTimeout(() => {
                if (apiStatusText.textContent === message) {
                    apiStatusText.textContent = '';
                    apiStatusText.className = 'status-text';
                }
            }, 5000);
        }
    }
});
