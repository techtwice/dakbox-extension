/**
 * DakBox Generic OTP Helper Content Script
 * Runs on all urls and acts on domains configured in dakboxOtpSiteConfig
 */

(function () {
    'use strict';

    if (window.__dakbox_generic_otp_loaded) return;
    window.__dakbox_generic_otp_loaded = true;

    const hostname = window.location.hostname;
    let otpConfig = null;
    let sessionActive = false;
    let targetEmail = null;
    let checkInterval = null;

    // Load config to see if this site is supported
    chrome.storage.local.get(['dakboxOtpSiteConfig', 'dakboxAutoOtpEnabled'], (data) => {
        if (data.dakboxAutoOtpEnabled === false) return; // User globally disabled OTP filling
        if (!data.dakboxOtpSiteConfig) return;

        otpConfig = data.dakboxOtpSiteConfig[hostname];
        if (otpConfig) {
            // Handle legacy format (if missing 'enabled', assume true)
            if (otpConfig.enabled === undefined) otpConfig.enabled = true;

            if (otpConfig.enabled) {
                console.log(`[DakBox] Site custom OTP config found and enabled for ${hostname}`, otpConfig);
                initGenericOtpHelper();
            } else {
                console.log(`[DakBox] Site custom OTP config found but DISABLED for ${hostname}`);
            }
        }
    });

    function initGenericOtpHelper() {
        // Setup listener for the submit trigger
        document.addEventListener('click', (e) => {
            // Check if what they clicked matches (or is inside) the trigger selector
            const target = e.target.closest(otpConfig.triggerSelector);
            if (target) {
                handleTriggerFound();
            }
        });

        // Also handle potential form submit events if the trigger is a form submission
        document.addEventListener('submit', (e) => {
            if (e.target.matches(otpConfig.triggerSelector)) {
                handleTriggerFound();
            }
        });

        // Check if we are ALREADY on a page looking for the OTP box
        // (e.g. they submitted on page A, and redirected to page B)
        checkAlreadyWaitingForOtp();
    }

    function handleTriggerFound() {
        if (sessionActive) return;

        // Try to find the email input
        const emailInput = document.querySelector(otpConfig.emailSelector);
        if (!emailInput || !emailInput.value) {
            console.warn("[DakBox] Trigger detected, but could not find associated email input or it was empty.");
            return;
        }

        const email = emailInput.value.trim().toLowerCase();

        // We only care about DakBox (and optionally Yopmail if supported later)
        if (!email.endsWith('@dakbox.net') && !email.endsWith('@dakbox.xyz') && !email.endsWith('@dakbox.com')) {
            return;
        }

        console.log(`[DakBox] Trigger detected for email: ${email}. Starting OTP polling...`);

        sessionActive = true;
        targetEmail = email;

        // Save session state to storage so it persists across page redirects
        chrome.storage.local.set({
            dakboxOtpSession: {
                email: email,
                domain: hostname,
                timestamp: Date.now()
            }
        });

        startOtpPolling(email);
    }

    function checkAlreadyWaitingForOtp() {
        chrome.storage.local.get(['dakboxOtpSession'], (data) => {
            if (data.dakboxOtpSession && data.dakboxOtpSession.domain === hostname) {
                // Check if session is still fresh (e.g. less than 5 mins old)
                if (Date.now() - data.dakboxOtpSession.timestamp < 5 * 60 * 1000) {
                    console.log(`[DakBox] Resuming previous OTP session for ${data.dakboxOtpSession.email}`);
                    sessionActive = true;
                    targetEmail = data.dakboxOtpSession.email;
                    startOtpPolling(targetEmail);
                } else {
                    // Clean up stale session
                    chrome.storage.local.remove('dakboxOtpSession');
                }
            }
        });
    }

    // Reuse the logic originally built for svp to fetch the OTP
    async function fetchRecentDakboxCode(emailAddress) {
        try {
            const username = emailAddress.split('@')[0];
            const domain = emailAddress.split('@')[1];

            const listUrl = `https://api.dakbox.net/v1/mailbox/${username}?domain=${domain}`;
            const response = await fetch(listUrl, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) return null;

            const data = await response.json();
            if (!data || !data.messages || data.messages.length === 0) return null;

            // Sort by ID to ensure we look at the newest first
            const messages = data.messages.sort((a, b) => b.id - a.id);
            const latestMsg = messages[0];

            // Check expiry if configured
            if (otpConfig.expiry) {
                const msgDate = new Date(latestMsg.created_at || latestMsg.date);
                const ageSeconds = (Date.now() - msgDate.getTime()) / 1000;

                if (ageSeconds > otpConfig.expiry) {
                    console.log(`[DakBox] Mail found but older than expiry (${ageSeconds}s > ${otpConfig.expiry}s)`);
                    return null;
                }
            }

            // Fetch physical content
            const contentUrl = `https://api.dakbox.net/v1/message/${latestMsg.id}`;
            const cRes = await fetch(contentUrl, {
                headers: { 'Accept': 'application/json' }
            });

            if (!cRes.ok) return null;

            const cData = await cRes.json();

            // Basic extraction (looking for 4-8 digit numbers usually)
            const text = cData.text_body || cData.html_body || "";

            // Common OTP patterns
            const patterns = [
                /[Cc]ode[\s:]*([0-9]{4,8})/i,
                /OTP[\s:]*([0-9]{4,8})/i,
                /(?<!\d)([0-9]{4,8})(?!\d)/ // fallback to any 4-8 standalone digit
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    // Check if it's not a generic year or similar false positive if using fallback
                    if (pattern === patterns[2] && (match[1].length < 4 || (match[1].startsWith('202') && match[1].length === 4))) {
                        continue;
                    }
                    return match[1];
                }
            }

            return null;

        } catch (error) {
            console.error("[DakBox] Error fetching OTP:", error);
            return null;
        }
    }

    function startOtpPolling(email) {
        if (checkInterval) clearInterval(checkInterval);

        let attempts = 0;
        const MAX_ATTEMPTS = 30; // 30 * 4 seconds = 2 minutes max polling

        console.log("[DakBox] Polling started.");

        checkInterval = setInterval(async () => {
            // 1. Try to find the target input box first
            // No point fetching if the page hasn't rendered the OTP box yet
            const otpInputs = document.querySelectorAll(otpConfig.otpSelector);

            if (otpInputs.length === 0) {
                // Wait for the UI
                attempts++;
                if (attempts >= MAX_ATTEMPTS) stopPolling();
                return;
            }

            // 2. We see the inputs, let's look for the email
            const otpCode = await fetchRecentDakboxCode(email);

            if (otpCode) {
                console.log(`[DakBox] OTP Found: ${otpCode}`);
                autoFillOtp(otpCode, otpInputs);
                stopPolling();
            }

            attempts++;
            if (attempts >= MAX_ATTEMPTS) {
                console.log("[DakBox] Polling timeout reached.");
                stopPolling();
            }

        }, 4000);
    }

    function stopPolling() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
        sessionActive = false;
        chrome.storage.local.remove('dakboxOtpSession');
    }

    function autoFillOtp(code, inputNodes) {
        const charArray = code.split('');

        if (inputNodes.length === 1) {
            // Single input field
            fillSingleInput(inputNodes[0], code);
        } else if (inputNodes.length > 1) {
            // Multiple input fields (1 per char)
            for (let i = 0; i < inputNodes.length && i < charArray.length; i++) {
                fillSingleInput(inputNodes[i], charArray[i]);
            }
        }
    }

    function fillSingleInput(inputElement, value) {
        // Use native setter to bypass React/Vue control
        try {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            // Also try textarea just in case
            const fallbackSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(inputElement, value);
            } else if (fallbackSetter) {
                fallbackSetter.call(inputElement, value);
            } else {
                inputElement.value = value;
            }
        } catch (e) {
            inputElement.value = value;
        }

        // Dispatch comprehensive events to ensure the site registers the change
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));

        // Simulate real keyboard events
        inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        inputElement.dispatchEvent(new KeyboardEvent('keyup', { key: value, bubbles: true }));
    }

})();
