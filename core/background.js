/**
 * DakBox Extension - Background Service Worker
 * Handles messaging between content scripts, OTP API calls, and tab management
 * Uses dakbox.net/api with Bearer token authentication
 */

// --- Element Picker State ---
let armedPickerField = null;

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (!request || typeof request !== 'object') {
            sendResponse({ error: 'Invalid request format' });
            return;
        }

        // Handle OTP fetch request (login OTP)
        if (request.action === 'fetchOtp') {
            fetchOtpFromDakBox(request.username, request.maxRetries || 5, request.expiry)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
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
            fetchRegistrationOtp(request.username, request.maxRetries || 5)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }

        // Handle open dakbox tab request
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
                'dakboxAutoOtpEnabled',
                'dakboxAutoOpenInbox',
                'dakboxLastUsername',
                'dakboxApiToken'
            ], (data) => {
                sendResponse(data);
            });
            return true;
        }

        // Handle save settings request
        if (request.action === 'saveSettings') {
            chrome.storage.local.set(request.settings, () => {
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

/**
 * Fetch OTP from DakBox API (for login verification)
 * Uses dakbox.net/api/otp/get with Bearer token
 */
async function fetchOtpFromDakBox(username, maxRetries = 5, expirySeconds = null) {
    const token = await getApiToken();
    if (!token) {
        return { success: false, error: 'API token not set. Please connect in extension settings.' };
    }

    let apiUrl = `https://dakbox.net/api/otp/get?email=${encodeURIComponent(username)}`;
    if (expirySeconds) {
        apiUrl += `&expiry=${encodeURIComponent(expirySeconds)}`;
    }

    console.log(`[DakBox] Fetching OTP from: ${apiUrl}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

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
                console.log(`[DakBox] API Response (HTTP ${response.status}):`, data);
            } catch (parseErr) {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                throw new Error('Failed to parse API response');
            }

            // Handle 401 Unauthorized
            if (response.status === 401) {
                return { success: false, error: 'API token invalid or expired. Please reconnect.' };
            }

            // Handle 410 Gone - OTP expired but might still have the code
            if (response.status === 410) {
                console.warn('[DakBox] OTP expired (410 Gone)');
                if (data && data.data && data.data.otp) {
                    console.log('[DakBox] Expired OTP code still available:', data.data.otp);
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
                    console.log(`[DakBox] No OTP in expired response, waiting 3s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                return { success: false, error: data?.message || 'OTP has expired' };
            }

            if (!response.ok) {
                throw new Error(data?.message || `HTTP error! status: ${response.status}`);
            }

            if (!data.success || !data.data) {
                throw new Error(data.message || 'Invalid API response');
            }

            const otpData = data.data;

            // Check if OTP is expired
            if (otpData.expired === true) {
                console.warn('[DakBox] OTP has expired');
                if (attempt < maxRetries) {
                    console.log(`[DakBox] Waiting 3s before retry ${attempt + 1}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                return { success: false, error: 'OTP has expired and no new OTP available' };
            }

            // Check remaining time
            if (otpData.remaining_seconds !== undefined && otpData.remaining_seconds < 10) {
                console.warn(`[DakBox] OTP has only ${otpData.remaining_seconds}s remaining`);
            }

            // Extract OTP
            if (!otpData.otp) {
                if (attempt < maxRetries) {
                    console.log(`[DakBox] No OTP in response, waiting 3s before retry ${attempt + 1}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
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
            console.error(`[DakBox] Attempt ${attempt}/${maxRetries} failed:`, error);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                return { success: false, error: error.message };
            }
        }
    }

    return { success: false, error: 'Max retries exceeded' };
}

/**
 * Fetch OTP from verification API (for registration verification)
 * Uses dakbox.net/api/otp/verification with Bearer token
 */
async function fetchRegistrationOtp(username, maxRetries = 5) {
    const token = await getApiToken();
    if (!token) {
        return { success: false, error: 'API token not set. Please connect in extension settings.' };
    }

    const apiUrl = `https://dakbox.net/api/otp/verification?email=${encodeURIComponent(username)}`;
    console.log(`[DakBox] Fetching registration OTP from: ${apiUrl}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

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
                console.log(`[DakBox] Registration OTP API Response (HTTP ${response.status}):`, data);
            } catch (parseErr) {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                throw new Error('Failed to parse API response');
            }

            // Handle 401 Unauthorized
            if (response.status === 401) {
                return { success: false, error: 'API token invalid or expired. Please reconnect.' };
            }

            // Handle 410 Gone - OTP expired but might still have the code
            if (response.status === 410) {
                console.warn('[DakBox] Registration OTP expired (410 Gone)');
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
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                return { success: false, error: data?.message || 'Registration OTP has expired' };
            }

            if (!response.ok) {
                throw new Error(data?.message || `HTTP error! status: ${response.status}`);
            }

            if (!data.success || !data.data) {
                throw new Error(data.message || 'Invalid API response');
            }

            const otpData = data.data;

            if (otpData.expired === true) {
                console.warn('[DakBox] Registration OTP has expired');
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                return { success: false, error: 'OTP has expired and no new OTP available' };
            }

            if (otpData.remaining_seconds !== undefined && otpData.remaining_seconds < 10) {
                console.warn(`[DakBox] Registration OTP has only ${otpData.remaining_seconds}s remaining`);
            }

            if (!otpData.otp) {
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
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
            console.error(`[DakBox] Registration OTP attempt ${attempt}/${maxRetries} failed:`, error);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                return { success: false, error: error.message };
            }
        }
    }

    return { success: false, error: 'Max retries exceeded' };
}

// Set default settings on install
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('[DakBox] Extension installed, setting defaults...');
        chrome.storage.local.set({
            dakboxAutoOtpEnabled: true,
            dakboxAutoOpenInbox: true,
            dakboxLastUsername: '',
            dakboxApiToken: ''
        });
    }
});

console.log('[DakBox] Background service worker initialized');
