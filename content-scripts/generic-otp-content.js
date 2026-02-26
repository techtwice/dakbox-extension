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
    chrome.storage.local.get(['dakboxOtpSiteConfig'], (data) => {
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

    // Reuse the logic originally built for svp to fetch the OTP via background script
    async function fetchRecentDakboxCode(emailAddress) {
        try {
            return new Promise((resolve) => {
                const messagePayload = {
                    action: 'fetchOtp',
                    username: emailAddress,
                    maxRetries: 1 // We handle our own retry loop in startOtpPolling
                };

                // Add the expiry param if configured so the background script/server can handle it
                if (otpConfig.expiry) {
                    messagePayload.expiry = otpConfig.expiry;
                }

                chrome.runtime.sendMessage(messagePayload, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[DakBox] Extension communication error:", chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }

                    if (response && response.success && response.otp) {
                        resolve(response.otp);
                    } else {
                        // The API didn't find a valid OTP or it was expired
                        if (response && response.error) {
                            console.log(`[DakBox] OTP fetch check: ${response.error}`);
                        }
                        resolve(null);
                    }
                });
            });

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
            attempts++;

            if (attempts >= MAX_ATTEMPTS) {
                console.log("[DakBox] Polling timeout reached.");
                stopPolling();
                return;
            }

            // Always try to fetch the OTP
            const otpCode = await fetchRecentDakboxCode(email);

            if (otpCode) {
                console.log(`[DakBox] OTP Found: ${otpCode}`);

                // Try to find the target input box
                const otpInputs = document.querySelectorAll(otpConfig.otpSelector);

                if (otpInputs.length > 0) {
                    autoFillOtp(otpCode, otpInputs, otpConfig);
                    stopPolling();
                } else {
                    console.log("[DakBox] OTP found, but input fields not found. Waiting for UI...");
                    // We keep polling. The user might navigate to the correct page soon.
                }
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

    function autoFillOtp(code, inputNodes, config = {}) {
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

        // Try to trigger auto-submit if configured
        if (config.otpSubmitSelector) {
            setTimeout(() => {
                try {
                    const submitBtn = document.querySelector(config.otpSubmitSelector);
                    if (submitBtn) {
                        console.log("[DakBox] Auto-clicking OTP submit button...");
                        submitBtn.click();
                    } else {
                        console.warn("[DakBox] Auto-submit button not found with selector:", config.otpSubmitSelector);
                    }
                } catch (e) {
                    console.error("[DakBox] Error auto-submitting:", e);
                }
            }, 300); // slight delay to allow React/Vue to process the input events
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
