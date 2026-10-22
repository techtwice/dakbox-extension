/**
 * DakBox Extension - Background Service Worker
 * Handles messaging between content scripts, OTP API calls, and tab management
 * Uses dakbox.net/api with Bearer token authentication
 */

importScripts('logger.js');

// --- Auto-update (production only) ---
// Only runs when installed from the Chrome Web Store (update_url present).
// Checks every 4 hours; reloads immediately if an update is available.
if (chrome.runtime.getManifest().update_url) {
    const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

    function checkForUpdate() {
        chrome.runtime.requestUpdateCheck((status) => {
            console.log(`[DakBox] Update check: ${status}`);
            if (status === 'update_available') {
                console.log('[DakBox] New version available — reloading to apply update.');
                chrome.runtime.reload();
            }
        });
    }

    // Check once on startup, then periodically
    checkForUpdate();
    setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}

// --- Element Picker State ---
let armedPickerField = null;

// --- Helper functions ---
async function getWebsiteHostname(sender) {
    if (sender && sender.tab && sender.tab.url) {
        try { return new URL(sender.tab.url).hostname; } catch (e) { }
    }
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0 && tabs[0].url) {
            return new URL(tabs[0].url).hostname;
        }
    } catch (e) { }
    return '';
}

// --- In-flight deduplication: if two content scripts call fetchOtp for the
// same email simultaneously, share one real fetch instead of firing two.
const inFlightOtpRequests = new Map();

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (!request || typeof request !== 'object') {
            sendResponse({ error: 'Invalid request format' });
            return;
        }

        // Handle OTP fetch request (login OTP)
        if (request.action === 'fetchOtp') {
            const key = request.username;
            getWebsiteHostname(sender).then(website => {
                // If an identical fetch is already in-flight, wait for it instead of starting a new one
                if (inFlightOtpRequests.has(key)) {
                    console.log(`[DakBox] Deduplicating fetch for ${key} — sharing in-flight request.`);
                    inFlightOtpRequests.get(key).then(result => sendResponse(result)).catch(() => sendResponse({ success: false, error: 'Fetch failed' }));
                    return;
                }
                const promise = fetchOtpFromDakBox(request.username, request.maxRetries || 2, request.expiry, website)
                    .finally(() => inFlightOtpRequests.delete(key));
                inFlightOtpRequests.set(key, promise);
                promise.then(result => sendResponse(result)).catch(error => sendResponse({ success: false, error: error.message }));
            });
            return true;
        }

        // Open a new tab (used for auto-opening DakBox/Yopmail inboxes from content scripts)
        if (request.action === 'openTab') {
            if (!request.url) {
                sendResponse({ success: false, error: 'No URL provided' });
                return;
            }
            // Security: only allow trusted domains to prevent content scripts
            // from opening arbitrary URLs
            const ALLOWED_URL_PREFIXES = [
                'https://dakbox.net/',
                'https://yopmail.com/'
            ];
            const urlAllowed = ALLOWED_URL_PREFIXES.some(prefix => request.url.startsWith(prefix));
            if (!urlAllowed) {
                console.warn('[DakBox BG] openTab blocked — untrusted URL:', request.url);
                sendResponse({ success: false, error: 'URL not allowed' });
                return;
            }

            chrome.storage.local.get(['dakboxApiToken'], (data) => {
                const token = data.dakboxApiToken;
                if (!token) {
                    sendResponse({ success: false, error: 'No API token available' });
                    return;
                }

                // Track auto-open with server
                fetch('https://dakbox.net/api/auto-opens/track', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    redirect: 'follow'
                })
                    .then(response => {
                        const contentType = response.headers.get('content-type');
                        if (!contentType || !contentType.includes('application/json')) {
                            throw new Error('Invalid response format');
                        }
                        return response.json().then(data => ({ status: response.status, ok: response.ok, data }));
                    })
                    .then(({ status, ok, data }) => {
                        if (ok && data.success) {
                            // Success - open the tab
                            chrome.tabs.create({ url: request.url });
                            sendResponse({ success: true, message: 'Tab opened', auto_opens: data.auto_opens });
                        } else {
                            // API returned error (403 or success: false)
                            console.warn(`[DakBox] Auto-open request failed (${status}):`, data.error);
                            sendResponse({
                                success: false,
                                limitReached: status === 403 || !data.success,
                                error: data.error || `HTTP ${status}`,
                                auto_opens: data.auto_opens
                            });
                        }
                    })
                    .catch(error => {
                        console.error('[DakBox] Auto-open tracking error:', error.message);
                        sendResponse({ success: false, error: 'Failed to track auto-open: ' + error.message });
                    });
            });
            return true; // async response
        }

        // --- Element Picker Logic ---
        if (request.action === 'armDakboxPicker') {
            const targetField = request.target;

            chrome.tabs.query({ windowType: 'normal' }, (tabs) => {
                const validTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));

                if (validTabs.length > 0) {
                    validTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
                    const targetTab = validTabs[0];

                    chrome.scripting.insertCSS({
                        target: { tabId: targetTab.id },
                        files: ['content-scripts/element-picker.css']
                    }).then(() => {
                        return chrome.scripting.executeScript({
                            target: { tabId: targetTab.id },
                            files: ['content-scripts/element-picker.js']
                        });
                    }).then(() => {
                        armedPickerField = targetField;
                        sendResponse({ success: true, message: 'Picker activated in your most recent tab. Please switch to it!' });
                    }).catch(err => {
                        console.error("[DakBox] Failed to inject picker:", err);
                        sendResponse({ success: false, error: err.message });
                    });
                } else {
                    sendResponse({ success: false, error: 'No valid web tabs open to pick from.' });
                }
            });
            return true;
        }

        if (request.action === 'dakboxPickerResult') {
            chrome.runtime.sendMessage({
                action: 'dakboxPickerResultToOptions',
                selector: request.selector,
                target: armedPickerField,
                cancelled: request.cancelled
            });
            armedPickerField = null;
            sendResponse({ success: true });
            return true;
        }

        // Handle registration OTP fetch request
        if (request.action === 'fetchRegistrationOtp') {
            const key = 'reg:' + request.username;
            getWebsiteHostname(sender).then(website => {
                if (inFlightOtpRequests.has(key)) {
                    console.log(`[DakBox] Deduplicating registration fetch for ${request.username} — sharing in-flight request.`);
                    inFlightOtpRequests.get(key).then(result => sendResponse(result)).catch(() => sendResponse({ success: false, error: 'Fetch failed' }));
                    return;
                }
                const promise = fetchRegistrationOtp(request.username, request.maxRetries || 2, website)
                    .finally(() => inFlightOtpRequests.delete(key));
                inFlightOtpRequests.set(key, promise);
                promise.then(result => sendResponse(result)).catch(error => sendResponse({ success: false, error: error.message }));
            });
            return true;
        }

        // Handle open dakbox tab request (manual opens from UI, not tracked as auto-open)
        if (request.action === 'openDakboxTab') {
            const url = `https://dakbox.net/go/${request.username}`;
            chrome.tabs.create({ url: url }, (tab) => {
                sendResponse({ success: true, tabId: tab.id });
            });
            return true;
        }

        // Handle get settings request
        if (request.action === 'getSettings') {
            chrome.storage.local.get([
                'dakboxAutoOtpEnabledSvp',
                'dakboxAutoOpenInbox',
                'dakboxAutoOpenYopmail',
                'dakboxLastUsername',
                'dakboxApiToken'
            ], (data) => {
                sendResponse(data);
            });
            return true;
        }

        // Handle save settings request — only allow whitelisted keys
        if (request.action === 'saveSettings') {
            const ALLOWED_SETTINGS_KEYS = [
                'dakboxAutoOtpEnabledSvp',
                'dakboxAutoOpenInbox',
                'dakboxAutoOpenYopmail',
                'dakboxAutoGenerate',
                'dakboxLastUsername',
                'dakboxOtpSiteConfig',
                'dakboxSiteConfig'
            ];
            const safeSettings = {};
            let hasInvalidKey = false;
            for (const key of Object.keys(request.settings || {})) {
                if (ALLOWED_SETTINGS_KEYS.includes(key)) {
                    safeSettings[key] = request.settings[key];
                } else {
                    console.warn('[DakBox BG] saveSettings: blocked disallowed key:', key);
                    hasInvalidKey = true;
                }
            }
            if (Object.keys(safeSettings).length === 0) {
                sendResponse({ success: false, error: hasInvalidKey ? 'Disallowed settings key' : 'No settings provided' });
                return true;
            }
            chrome.storage.local.set(safeSettings, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ success: true });
                }
            });
            return true;
        }

    } catch (error) {
        console.error('[DakBox BG] Error:', error);
        sendResponse({ error: error.message });
    }
});

/**
 * Get API token from storage
 */
async function getApiToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['dakboxApiToken'], (data) => {
            resolve(data.dakboxApiToken || null);
        });
    });
}

// Client-side wait must outlast the server's long-poll (110 s, Yopmail path up to ~100 s). If we abort
// earlier the server can still find the mail and bill the quota while the code is thrown away here.
const OTP_CLIENT_TIMEOUT_MS = 120000;

// Registration lookups send BOTH filters so the server really filters (it ignores a lone `from` or
// `subject`). Both are substring, case-insensitive matches on the real mail. Overridable from
// chrome.storage.local (dakboxRegFrom / dakboxRegSubject) if the sender or wording ever changes.
const REG_FROM_DEFAULT = 'pacc.sa';
const REG_SUBJECT_DEFAULT = 'Verification';

function isYopmailAddress(identifier) {
    return /@yopmail\.com$/i.test(identifier || '');
}

async function buildOtpUrl(kind, identifier, expirySeconds, website) {
    const params = new URLSearchParams();
    params.set('email', identifier); // "user" (dakbox.net) or a full user@yopmail.com address

    if (kind === 'verification') {
        const s = await new Promise((resolve) => chrome.storage.local.get(['dakboxRegFrom', 'dakboxRegSubject'], resolve));
        params.set('from', s.dakboxRegFrom || REG_FROM_DEFAULT);
        params.set('subject', s.dakboxRegSubject || REG_SUBJECT_DEFAULT);
    } else if (expirySeconds) {
        params.set('expiry', expirySeconds);
    }

    // Yopmail inboxes are read by the server's browser scraper; target=svpotp selects its fast path
    if (isYopmailAddress(identifier)) params.set('target', 'svpotp');
    if (website) params.set('website', website);

    return `https://dakbox.net/api/otp/${kind === 'verification' ? 'verification' : 'get'}?${params.toString()}`;
}

/**
 * Shared OTP fetch for both flows.
 *   kind = 'get'          → login OTP        (GET /api/otp/get)
 *   kind = 'verification' → registration OTP (GET /api/otp/verification)
 * identifier is the dakbox.net username, or a full @yopmail.com address.
 */
async function fetchOtpFromServer(kind, identifier, maxRetries = 2, expirySeconds = null, website = '') {
    const label = kind === 'verification' ? 'Registration OTP' : 'OTP';
    const token = await getApiToken();
    if (!token) {
        return { success: false, error: 'API token not set. Please connect in extension settings.' };
    }

    const apiUrl = await buildOtpUrl(kind, identifier, expirySeconds, website);
    console.log(`[DakBox] Fetching ${label} from: ${apiUrl}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OTP_CLIENT_TIMEOUT_MS);
        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            clearTimeout(timeoutId);

            // Try to parse JSON body even on non-200 responses
            let data;
            try {
                data = await response.json();
                console.log(`[DakBox] ${label} API response (HTTP ${response.status}):`, data);
            } catch (parseErr) {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                throw new Error('Failed to parse API response');
            }

            // The server reports failures as { error: "..." }; Laravel validation uses { message: "..." }
            const serverMsg = data?.error || data?.message;

            if (response.status === 401) {
                return { success: false, error: 'API token invalid or expired. Please reconnect.' };
            }

            // 403 — disabled key / no subscription / quota used up: show the server's real reason
            if (response.status === 403) {
                const msg = serverMsg || 'Access denied (403). Please check your subscription.';
                console.warn('[DakBox] 403 Forbidden:', msg);
                return { success: false, error: msg, isSubscriptionError: true };
            }

            // 410 — code exists but is past its validity window
            if (response.status === 410) {
                console.warn(`[DakBox] ${label} expired (410 Gone)`);
                if (data && data.data && data.data.otp) {
                    return {
                        success: true,
                        otp: data.data.otp,
                        subject: data.data.subject,
                        from: data.data.from,
                        remaining_seconds: 0,
                        expired: true
                    };
                }
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                }
                return { success: false, error: serverMsg || `${label} has expired` };
            }

            // 429 — a previous request for this inbox is still being polled server-side
            if (response.status === 429) {
                const retryAfter = (data && data.retry_after) ? data.retry_after : 10;
                console.log(`[DakBox] 429: previous request in progress. Waiting ${retryAfter}s (attempt ${attempt}/${maxRetries})...`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }
                return { success: false, error: 'Rate limited (429): another request is already in progress', isSilent: true };
            }

            // 404 — the server already waited its full window and no matching mail arrived
            if (response.status === 404) {
                console.log(`[DakBox] ${label}: nothing found yet (attempt ${attempt}/${maxRetries})`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                }
                return { success: false, error: serverMsg || 'No OTP email received', isSilent: true };
            }

            if (!response.ok) {
                throw new Error(serverMsg || `HTTP error! status: ${response.status}`);
            }

            if (!data.success || !data.data) {
                throw new Error(serverMsg || 'Invalid API response');
            }

            const otpData = data.data;

            if (otpData.expired === true) {
                console.warn(`[DakBox] ${label} has expired`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                }
                return { success: false, error: 'OTP has expired and no new OTP available' };
            }

            if (otpData.remaining_seconds !== undefined && otpData.remaining_seconds !== null && otpData.remaining_seconds < 10) {
                console.warn(`[DakBox] ${label} has only ${otpData.remaining_seconds}s remaining`);
            }

            if (!otpData.otp) {
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                }
                return { success: false, error: 'No OTP found in response' };
            }

            return {
                success: true,
                otp: otpData.otp,
                subject: otpData.subject,
                from: otpData.from,
                remaining_seconds: otpData.remaining_seconds,
                expired: otpData.expired
            };

        } catch (error) {
            clearTimeout(timeoutId);
            const timedOut = error.name === 'AbortError';
            const message = timedOut
                ? `No response from DakBox within ${OTP_CLIENT_TIMEOUT_MS / 1000}s`
                : error.message;
            const isSilentError = timedOut || /404|410|No OTP email/i.test(message);

            if (isSilentError) {
                console.log(`[DakBox] ${label}: no result yet (attempt ${attempt}/${maxRetries}): ${message}`);
            } else {
                console.error(`[DakBox] ${label} attempt ${attempt}/${maxRetries} failed:`, error);
            }

            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                return { success: false, error: message, isSilent: isSilentError };
            }
        }
    }

    return { success: false, error: 'Max retries exceeded' };
}

/** Login OTP (GET /api/otp/get). identifier = dakbox.net username or full @yopmail.com address. */
function fetchOtpFromDakBox(identifier, maxRetries = 2, expirySeconds = null, website = '') {
    return fetchOtpFromServer('get', identifier, maxRetries, expirySeconds, website);
}

/** Registration OTP (GET /api/otp/verification) with explicit sender + subject filters. */
function fetchRegistrationOtp(identifier, maxRetries = 2, website = '') {
    return fetchOtpFromServer('verification', identifier, maxRetries, null, website);
}

// Set default settings on install
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('[DakBox] Extension installed, setting defaults...');
        chrome.storage.local.set({
            dakboxAutoOtpEnabledSvp: true,
            dakboxAutoOpenInbox: false,
            dakboxAutoOpenYopmail: true,
            dakboxAutoGenerate: true,
            dakboxLastUsername: '',
            dakboxApiToken: ''
        });
    }
});

console.log('[DakBox] Background service worker initialized');
