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
    const toggleDakboxHelper = document.getElementById('toggle-dakbox-helper');
    const requestSiteBtn = document.getElementById('request-site-btn');
    const openOptionsBtn = document.getElementById('open-options-btn');
    const githubBtn = document.getElementById('github-btn');
    const updateBtn = document.getElementById('update-btn');
    const versionBadge = document.getElementById('version-badge');

    // ─────────────────────────────────────────────
    // Initialize
    // ─────────────────────────────────────────────

    const manifest = chrome.runtime.getManifest();
    versionBadge.textContent = `v${manifest.version}`;

    // Hide the update button in dev mode — requestUpdateCheck only works on Web Store installs
    const isFromStore = !!(manifest.update_url);
    if (updateBtn && !isFromStore) {
        updateBtn.style.display = 'none';
    } else if (updateBtn && isFromStore) {
        // Auto-check for updates silently when popup opens
        chrome.runtime.requestUpdateCheck((status) => {
            if (status === 'update_available') {
                // Show a green pulsing dot badge on the button
                updateBtn.title = 'Update available — click to install!';
                updateBtn.style.color = '#4caf7d';
                updateBtn.style.position = 'relative';
                const dot = document.createElement('span');
                dot.style.cssText = 'position:absolute;top:4px;right:4px;width:8px;height:8px;background:#4caf7d;border-radius:50%;animation:pulse 1.2s infinite;';
                updateBtn.appendChild(dot);
                // Inject the pulse keyframes once
                if (!document.getElementById('dakbox-pulse-style')) {
                    const style = document.createElement('style');
                    style.id = 'dakbox-pulse-style';
                    style.textContent = '@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}';
                    document.head.appendChild(style);
                }
            }
        });
    }

    // Check if API token is already saved
    chrome.storage.local.get({
        'dakboxApiToken': '',
        'dakboxUserInfo': null,
        'dakboxAutoOtpEnabledSvp': true,
        'dakboxAutoOpenInbox': false,
        'dakboxAutoOpenYopmail': true,
        'dakboxAutoGenerate': true,
        'dakboxHelperVisible': false,
        'dakboxLastUsername': '',
        'dakboxAutoOpenCount': 0,
        'dakboxAutoOpenMonthKey': ''
    }, (data) => {
        toggleAutoOtp.checked = data.dakboxAutoOtpEnabledSvp === true;
        toggleAutoOpen.checked = data.dakboxAutoOpenInbox === true;
        toggleAutoYopmail.checked = data.dakboxAutoOpenYopmail === true;
        toggleAutoGenerate.checked = data.dakboxAutoGenerate === true;
        toggleDakboxHelper.checked = data.dakboxHelperVisible !== false;

        if (data.dakboxLastUsername) {
            usernameInput.value = data.dakboxLastUsername;
            usernamePreview.textContent = data.dakboxLastUsername;
        }

        if (data.dakboxApiToken) {
            // Token exists - show connected view
            showConnectedView(data.dakboxUserInfo);
            refreshAutoOpens(data.dakboxUserInfo);
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
     * Display auto-opens from server user info
     * @param {object} userInfo - user info from GET /api/user response
     */
    function refreshAutoOpens(userInfo) {
        if (!planAutoOpens || !userInfo?.autoOpens) return;

        const { limit, used, remaining } = userInfo.autoOpens;
        
        // Display "Unlimited" for premium users (limit is a string "Unlimited")
        if (limit === 'Unlimited' || remaining === 'Unlimited') {
            planAutoOpens.textContent = '∞ / ∞';
            planAutoOpens.style.color = '';
            planAutoOpens.title = 'Unlimited auto-opens (Premium)';
        } else {
            planAutoOpens.textContent = `${used} / ${limit}`;
            // Red if no remaining, yellow if low
            if (remaining === 0) {
                planAutoOpens.style.color = '#e94560';
                planAutoOpens.title = 'Auto-opens limit reached. Upgrade for more.';
            } else if (remaining <= Math.ceil(limit * 0.2)) {
                planAutoOpens.style.color = '#faad14';
                planAutoOpens.title = `${remaining} auto-opens remaining`;
            } else {
                planAutoOpens.style.color = '';
                planAutoOpens.title = `${remaining} auto-opens remaining`;
            }
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
                },
                redirect: 'follow'
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                console.error('[DakBox] Failed to parse response:', e);
                if (!silent) setApiStatus('Failed to parse API response', 'error');
                return;
            }

            // Check HTTP status first
            if (!response.ok) {
                const errMsg = response.status === 401 ? 'Invalid or expired token' : 
                               response.status === 403 ? 'Access denied' :
                               `Error: ${response.status}`;
                console.warn('[DakBox] API response not ok:', response.status, data);
                chrome.storage.local.remove(['dakboxApiToken', 'dakboxUserInfo']);
                showApiSetupView();
                setApiStatus(errMsg, 'error');
                return;
            }

            // Handle API error response
            if (data.error) {
                console.warn('[DakBox] API error:', data.error);
                chrome.storage.local.remove(['dakboxApiToken', 'dakboxUserInfo']);
                showApiSetupView();
                setApiStatus(data.error, 'error');
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
                    otpRemaining: data.otp_helper?.remaining ?? null,
                    autoOpens: {
                        limit: data.auto_opens?.limit ?? 50,
                        used: data.auto_opens?.used ?? 0,
                        remaining: data.auto_opens?.remaining ?? 50
                    }
                };

                // Save token and user info
                chrome.storage.local.set({
                    dakboxApiToken: token,
                    dakboxUserInfo: userInfo
                });

                showConnectedView(userInfo);
                // Display auto-opens from server data
                refreshAutoOpens(userInfo);
                if (!silent) setApiStatus('Connected successfully!', 'success');
            } else {
                console.warn('[DakBox] Invalid response - no user data:', data);
                if (!silent) setApiStatus('Invalid response from API', 'error');
            }
        } catch (error) {
            console.error('[DakBox] Connection error:', error);
            if (!silent) setApiStatus('Connection failed: ' + error.message, 'error');
        }
    }

    // ─────────────────────────────────────────────
    // Track Auto-Opens
    // ─────────────────────────────────────────────

    /**
     * Track an auto-open with the server
     * Called by content scripts when they auto-open a tab
     * @param {function} callback - callback(success, response)
     */
    window.trackAutoOpen = async function(callback) {
        try {
            const { dakboxApiToken } = await chrome.storage.local.get('dakboxApiToken');
            if (!dakboxApiToken) {
                console.warn('[DakBox] No API token for auto-open tracking');
                if (callback) callback(false, { error: 'No API token' });
                return;
            }

            const response = await fetch('https://dakbox.net/api/auto-opens/track', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${dakboxApiToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                redirect: 'follow'
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                if (callback) callback(false, { error: 'Failed to parse response' });
                return;
            }

            if (response.status === 403) {
                console.warn('[DakBox] Auto-opens limit reached:', data.error);
                if (callback) callback(false, data);
                return;
            }

            if (response.ok) {
                console.log('[DakBox] Auto-open tracked:', data);
                // Update stored user info with latest auto_opens data
                if (data.auto_opens) {
                    chrome.storage.local.get('dakboxUserInfo', (result) => {
                        const userInfo = result.dakboxUserInfo || {};
                        userInfo.autoOpens = {
                            limit: data.auto_opens.limit,
                            used: data.auto_opens.used,
                            remaining: data.auto_opens.remaining
                        };
                        chrome.storage.local.set({ dakboxUserInfo: userInfo });
                        refreshAutoOpens(userInfo);
                    });
                }
                if (callback) callback(true, data);
            } else {
                console.error('[DakBox] Auto-open tracking failed:', response.status, data);
                if (callback) callback(false, data);
            }
        } catch (error) {
            console.error('[DakBox] Auto-open tracking error:', error.message);
            if (callback) callback(false, { error: error.message });
        }
    };

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
        chrome.storage.local.set({ dakboxAutoOtpEnabledSvp: toggleAutoOtp.checked });
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

    toggleDakboxHelper.addEventListener('change', () => {
        const visible = toggleDakboxHelper.checked;
        chrome.storage.local.set({ dakboxHelperVisible: visible });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'setDakboxHelperVisible',
                    visible: visible
                });
            }
        });
        setStatus(`DakBox Helper Panel ${visible ? 'shown' : 'hidden'}`, 'success');
    });

    requestSiteBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://dakbox.net/post/help-us-expand-dakbox-suggest-websites-for-seamless-otp-automation' });
    });

    const otpConfigsBtn = document.getElementById('otp-configs-btn');
    if (otpConfigsBtn) {
        otpConfigsBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('ui/options.html'));
            }
        });
    }

    if (openOptionsBtn) {
        openOptionsBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('ui/options.html'));
            }
        });
    }

    if (githubBtn) {
        githubBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'https://github.com/techtwice/dakbox-extension' });
        });
    }

    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            const svg = updateBtn.querySelector('svg');
            // Spin the icon while checking
            svg.style.transition = 'transform 0.6s linear';
            svg.style.transform = 'rotate(360deg)';
            setTimeout(() => { svg.style.transform = ''; }, 700);

            updateBtn.disabled = true;
            updateBtn.title = 'Checking...';

            chrome.runtime.requestUpdateCheck((status) => {
                updateBtn.disabled = false;
                if (status === 'update_available') {
                    updateBtn.title = 'Update available — reloading...';
                    updateBtn.style.color = '#4caf7d';
                    // Reload the extension to apply the update
                    setTimeout(() => chrome.runtime.reload(), 1200);
                } else if (status === 'no_update') {
                    updateBtn.title = 'Already up to date!';
                    updateBtn.style.color = '#4caf7d';
                    setTimeout(() => {
                        updateBtn.title = 'Check for updates';
                        updateBtn.style.color = '';
                    }, 3000);
                } else {
                    // 'throttled' — Chrome rate-limits this call
                    updateBtn.title = 'Try again in a few minutes';
                    setTimeout(() => {
                        updateBtn.title = 'Check for updates';
                    }, 3000);
                }
            });
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
