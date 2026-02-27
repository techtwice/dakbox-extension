/**
 * DakBox SVP OTP Content Script
 * Runs on svp-international.pacc.sa to auto-detect dakbox.net emails,
 * open DakBox inbox, and auto-fill OTP verification codes
 *
 * EXACT COPY of dakbox.net related functions from manpowerAI3.0/modules/domains/svp-international.js
 * Functions copied: checkForOtpVerificationPage, checkForRegistrationOtpPage,
 *   setupOtpVerificationObserver, setupRegistrationOtpObserver,
 *   openDakboxTab, handleOtpAutoFill, handleRegistrationOtpAutoFill,
 *   fetchOtpFromDakBox (via background), fetchRegistrationOtp (via background),
 *   fillVerificationCode, clickSignInButton
 */

(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.__dakbox_svp_loaded) return;
    window.__dakbox_svp_loaded = true;

    // ─────────────────────────────────────────────
    // Logging (matches original ENABLE_LOGGING pattern)
    // ─────────────────────────────────────────────

    const ENABLE_LOGGING = true;
    function log(...args) { if (ENABLE_LOGGING) console.log(...args); }
    function warn(...args) { if (ENABLE_LOGGING) console.warn(...args); }
    function error(...args) { if (ENABLE_LOGGING) console.error(...args); }

    // ─────────────────────────────────────────────
    // Settings
    // ─────────────────────────────────────────────

    let autoOtpEnabled = true;
    let autoOpenInbox = true;
    let autoOpenYopmail = true;

    chrome.storage.local.get(['dakboxAutoOtpEnabled', 'dakboxAutoOpenInbox', 'dakboxAutoOpenYopmail', 'dakboxOtpSiteConfig'], (data) => {
        // Assume default true if undefined
        autoOtpEnabled = data.dakboxAutoOtpEnabled !== false;

        // Check if there is a custom site rule that overrides this setting
        const hostname = window.location.hostname;
        if (data.dakboxOtpSiteConfig && data.dakboxOtpSiteConfig[hostname]) {
            const customConfig = data.dakboxOtpSiteConfig[hostname];
            const isCustomEnabled = customConfig.enabled !== false;

            if (isCustomEnabled) {
                log(`[DakBox-SVP] Custom site config found and enabled for ${hostname}, OVERRIDING global Auto OTP setting.`);
                autoOtpEnabled = true;
            }
        }

        autoOpenInbox = data.dakboxAutoOpenInbox !== false;
        autoOpenYopmail = data.dakboxAutoOpenYopmail !== false;
        log(`[DakBox-SVP] Settings loaded - Auto OTP: ${autoOtpEnabled}, Auto Open: ${autoOpenInbox}, Auto Yopmail: ${autoOpenYopmail}`);
    });

    // Listen for real-time settings changes from the popup
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        // Handling dakboxOtpSiteConfig changes requires checking global state and logic again,
        // but to keep it simple, we just reload the page or update if we see a change to the global button.
        if (changes.dakboxAutoOtpEnabled) {
            autoOtpEnabled = changes.dakboxAutoOtpEnabled.newValue !== false;
            log(`[DakBox-SVP] Auto OTP setting changed to: ${autoOtpEnabled}`);

            // Re-check override
            chrome.storage.local.get(['dakboxOtpSiteConfig'], (data) => {
                const hostname = window.location.hostname;
                if (data.dakboxOtpSiteConfig && data.dakboxOtpSiteConfig[hostname]) {
                    if (data.dakboxOtpSiteConfig[hostname].enabled !== false) {
                        autoOtpEnabled = true;
                        log(`[DakBox-SVP] Auto OTP overridden back to TRUE by Custom Site Config`);
                    }
                }
            });
        }

        if (changes.dakboxOtpSiteConfig) {
            const hostname = window.location.hostname;
            const newConfigs = changes.dakboxOtpSiteConfig.newValue || {};
            if (newConfigs[hostname] && newConfigs[hostname].enabled !== false) {
                autoOtpEnabled = true;
                log(`[DakBox-SVP] Auto OTP overridden to TRUE by new Custom Site Config`);
            } else {
                // We'd have to re-fetch dakboxAutoOtpEnabled to know what it was natively to restore it. 
                // For simplicity, we just leave it. A page refresh will correctly initialize it.
                chrome.storage.local.get(['dakboxAutoOtpEnabled'], (nativeData) => {
                    autoOtpEnabled = nativeData.dakboxAutoOtpEnabled !== false;
                    log(`[DakBox-SVP] Custom site config disabled, restored Auto OTP setting to: ${autoOtpEnabled}`);
                });
            }
        }

        if (changes.dakboxAutoOpenInbox) {
            autoOpenInbox = changes.dakboxAutoOpenInbox.newValue !== false;
            log(`[DakBox-SVP] Auto Open Inbox setting changed to: ${autoOpenInbox}`);
        }
        if (changes.dakboxAutoOpenYopmail) {
            autoOpenYopmail = changes.dakboxAutoOpenYopmail.newValue !== false;
            log(`[DakBox-SVP] Auto Open Yopmail setting changed to: ${autoOpenYopmail}`);
        }
    });

    // ─────────────────────────────────────────────
    // Helper: isElementVisible (from original)
    // ─────────────────────────────────────────────

    function isElementVisible(element) {
        if (!element) return false;
        return element.offsetParent !== null;
    }

    // ─────────────────────────────────────────────
    let otpCheckAttempts = 0;
    const MAX_OTP_CHECKS = 10;

    function checkForOtpVerificationPage() {
        // Don't re-check if already handling
        if (window.__svp_otp_handling_in_progress || window.__svp_otp_filled) {
            return;
        }

        // Check if we've hit the maximum attempts without starting the flow
        if (otpCheckAttempts >= MAX_OTP_CHECKS && !autoOtpEnabled) {
            return;
        }

        otpCheckAttempts++;

        // Look for "Welcome back" heading
        const welcomeBackHeading = document.querySelector('h1, h2, h3, h4, h5, h6');
        const isWelcomePage = welcomeBackHeading &&
            welcomeBackHeading.textContent.toLowerCase().includes('welcome back');

        // Look for verification code text
        const pageText = document.body.textContent || '';
        const hasVerificationText = pageText.includes('verification code') ||
            pageText.includes('Verification Code');

        // Look for verification code input boxes (typically 6 individual inputs)
        const verificationInputs = document.querySelectorAll('input[maxlength="1"], input.otp-input, input.verification-input');
        const hasVerificationInputs = verificationInputs.length >= 4;

        // Look for email in specific elements (more reliable than full page text)
        let dakboxEmail = null;
        let yopmailEmail = null;

        // Try to find email in strong/bold elements, spans with email, or specific containers
        const emailContainers = document.querySelectorAll('strong, b, span, p, div');
        for (const container of emailContainers) {
            const text = container.textContent || '';
            // Only check if the element contains exactly an email (not part of a longer sentence)
            const dakboxRegex = /^([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)$/i;
            const yopmailRegex = /^([a-zA-Z0-9][a-zA-Z0-9._%+-]*@yopmail\.com)$/i;

            const matchDakbox = text.trim().match(dakboxRegex);
            if (matchDakbox) {
                dakboxEmail = matchDakbox[1];
                log(`[SVP-OTP] Found dakbox.net email in element: ${dakboxEmail}`);
            }

            const matchYopmail = text.trim().match(yopmailRegex);
            if (matchYopmail) {
                yopmailEmail = matchYopmail[1];
                log(`[SVP-OTP] Found yopmail.com email in element: ${yopmailEmail}`);
            }

            if (dakboxEmail || yopmailEmail) break;
        }

        // Fallback: search with more restrictive pattern in page text
        if (!dakboxEmail && !yopmailEmail) {
            const dakboxMatch = pageText.match(/(?:to\s+)([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (dakboxMatch) {
                dakboxEmail = dakboxMatch[1];
                log(`[SVP-OTP] Found dakbox.net email via page text: ${dakboxEmail}`);
            }

            const yopmailMatch = pageText.match(/(?:to\s+)([a-zA-Z0-9][a-zA-Z0-9._%+-]*@yopmail\.com)/i);
            if (yopmailMatch) {
                yopmailEmail = yopmailMatch[1];
                log(`[SVP-OTP] Found yopmail.com email via page text: ${yopmailEmail}`);
            }
        }

        // Additional fallback: find any email anywhere on the page
        if (!dakboxEmail && !yopmailEmail) {
            const globalDakboxMatch = pageText.match(/([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (globalDakboxMatch) {
                dakboxEmail = globalDakboxMatch[1];
                log(`[SVP-OTP] Found dakbox.net email via global search: ${dakboxEmail}`);
            }

            const globalYopmailMatch = pageText.match(/([a-zA-Z0-9][a-zA-Z0-9._%+-]*@yopmail\.com)/i);
            if (globalYopmailMatch) {
                yopmailEmail = globalYopmailMatch[1];
                log(`[SVP-OTP] Found yopmail.com email via global search: ${yopmailEmail}`);
            }
        }

        if ((isWelcomePage || hasVerificationText) && (hasVerificationInputs || dakboxEmail || yopmailEmail)) {
            log("[SVP-OTP] OTP verification page detected!");

            if (dakboxEmail) {
                log(`[SVP-OTP] DakBox email found on page: ${dakboxEmail}`);

                // Open Dakbox inbox in new tab if not already opened
                if (autoOpenInbox && !window.__svp_dakbox_opened) {
                    log(`[SVP-Dakbox] Opening Dakbox inbox for: ${dakboxEmail}`);
                    openDakboxTab(dakboxEmail);
                }

                // Also auto-fill OTP
                if (autoOtpEnabled) {
                    handleOtpAutoFill(dakboxEmail);
                } else if (otpCheckAttempts >= MAX_OTP_CHECKS) {
                    log("[SVP-OTP] Auto OTP is disabled and max view attempts reached. Stopping checks.");
                    // Mark as filled so the observers stop firing
                    window.__svp_otp_filled = true;
                }
            } else if (yopmailEmail) {
                log(`[SVP-OTP] Yopmail email found on page: ${yopmailEmail}`);

                // Open Yopmail inbox in new tab if not already opened
                if (autoOpenYopmail && !window.__svp_yopmail_opened) {
                    openYopmailTab(yopmailEmail);
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // checkForRegistrationOtpPage
    // EXACT COPY from SVPInternationalAutomation.checkForRegistrationOtpPage
    // ─────────────────────────────────────────────

    let regOtpCheckAttempts = 0;

    function checkForRegistrationOtpPage() {
        if (window.__svp_reg_otp_handling_in_progress || window.__svp_reg_otp_filled) {
            return;
        }

        if (regOtpCheckAttempts >= MAX_OTP_CHECKS && !autoOtpEnabled) {
            return;
        }

        regOtpCheckAttempts++;

        // Check for "Email verification" or "Account Verification" text
        const pageText = document.body.textContent || '';
        const isEmailVerification = pageText.includes('Email verification') ||
            pageText.includes('Verification Code') ||
            pageText.includes('verification code');

        // Check for Step 4 indicator (Account Verification step)
        const isStep4 = pageText.includes('Account Verification') ||
            (pageText.includes('Create your account') && pageText.includes('Verification Code'));

        if (!isEmailVerification && !isStep4) {
            return;
        }

        // Look for verification code input boxes
        const verificationInputs = document.querySelectorAll('input[maxlength="1"]');
        if (verificationInputs.length < 4) {
            return;
        }

        log("[SVP-RegOTP] Registration Step 4 (Account Verification) detected!");

        // Find email on the page
        let dakboxEmail = null;
        let yopmailEmail = null;

        const emailContainers = document.querySelectorAll('strong, b, span, p, div');
        for (const container of emailContainers) {
            const text = container.textContent || '';
            const dakboxRegex = /^([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)$/i;
            const yopmailRegex = /^([a-zA-Z0-9][a-zA-Z0-9._%+-]*@yopmail\.com)$/i;

            const matchDakbox = text.trim().match(dakboxRegex);
            if (matchDakbox) {
                dakboxEmail = matchDakbox[1];
                log(`[SVP-RegOTP] Found dakbox.net email: ${dakboxEmail}`);
            }

            const matchYopmail = text.trim().match(yopmailRegex);
            if (matchYopmail) {
                yopmailEmail = matchYopmail[1];
                log(`[SVP-RegOTP] Found yopmail.com email: ${yopmailEmail}`);
            }

            if (dakboxEmail || yopmailEmail) break;
        }

        // Fallback: search in page text
        if (!dakboxEmail && !yopmailEmail) {
            const dakboxMatch = pageText.match(/(?:to\s+)([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (dakboxMatch) {
                dakboxEmail = dakboxMatch[1];
                log(`[SVP-RegOTP] Found dakbox.net email via text: ${dakboxEmail}`);
            }

            const yopmailMatch = pageText.match(/(?:to\s+)([a-zA-Z0-9][a-zA-Z0-9._%+-]*@yopmail\.com)/i);
            if (yopmailMatch) {
                yopmailEmail = yopmailMatch[1];
                log(`[SVP-RegOTP] Found yopmail.com email via text: ${yopmailEmail}`);
            }
        }

        // Additional fallback: find any email anywhere on the page
        if (!dakboxEmail && !yopmailEmail) {
            const globalDakboxMatch = pageText.match(/([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (globalDakboxMatch) {
                dakboxEmail = globalDakboxMatch[1];
                log(`[SVP-RegOTP] Found dakbox.net email via global search: ${dakboxEmail}`);
            }

            const globalYopmailMatch = pageText.match(/([a-zA-Z0-9][a-zA-Z0-9._%+-]*@yopmail\.com)/i);
            if (globalYopmailMatch) {
                yopmailEmail = globalYopmailMatch[1];
                log(`[SVP-RegOTP] Found yopmail.com email via global search: ${yopmailEmail}`);
            }
        }

        if (dakboxEmail) {
            log(`[SVP-RegOTP] DakBox email found: ${dakboxEmail}`);

            // Open Dakbox inbox in new tab if not already opened
            if (autoOpenInbox && !window.__svp_dakbox_opened) {
                log(`[SVP-Dakbox] Opening Dakbox inbox for registration: ${dakboxEmail}`);
                openDakboxTab(dakboxEmail);
            }

            // Also auto-fill OTP
            if (autoOtpEnabled) {
                handleRegistrationOtpAutoFill(dakboxEmail);
            } else if (regOtpCheckAttempts >= MAX_OTP_CHECKS) {
                log("[SVP-RegOTP] Auto OTP is disabled and max view attempts reached. Stopping checks.");
                window.__svp_reg_otp_filled = true;
            }
        } else if (yopmailEmail) {
            log(`[SVP-RegOTP] Yopmail email found: ${yopmailEmail}`);

            // Open Yopmail inbox in new tab if not already opened
            if (autoOpenYopmail && !window.__svp_yopmail_opened) {
                openYopmailTab(yopmailEmail);
            }
        } else {
            log("[SVP-RegOTP] No email found on registration verification page");
        }
    }

    // ─────────────────────────────────────────────
    // openDakboxTab
    // EXACT COPY from SVPInternationalAutomation.openDakboxTab
    // ─────────────────────────────────────────────

    function openDakboxTab(email) {
        try {
            // Extract username from dakbox.net email
            const match = email.match(/^([^@]+)@dakbox\.net$/i);
            if (!match) {
                error("[SVP-Dakbox] Invalid dakbox.net email format:", email);
                return;
            }

            const username = match[1];
            const dakboxUrl = `https://dakbox.net/go/${username}`;

            log(`[SVP-Dakbox] Opening Dakbox for: ${username}`);
            log(`[SVP-Dakbox] URL: ${dakboxUrl}`);

            // Mark as opened to prevent duplicate tabs
            window.__svp_dakbox_opened = true;

            // Open in new tab
            window.open(dakboxUrl, '_blank');

            log("[SVP-Dakbox] Dakbox tab opened successfully");
        } catch (err) {
            error("[SVP-Dakbox] Error opening Dakbox tab:", err);
        }
    }

    // ─────────────────────────────────────────────
    // openYopmailTab
    // ─────────────────────────────────────────────

    /**
     * Open Yopmail inbox in a new tab
     */
    function openYopmailTab(email) {
        try {
            // Extract username from yopmail email
            const match = email.match(/^([^@]+)@yopmail\.com$/i);
            if (!match) {
                error("[SVP-Yopmail] Invalid yopmail email format:", email);
                return;
            }

            const username = match[1];
            const yopmailUrl = `https://yopmail.com/?${username}`;

            log(`[SVP-Yopmail] Opening Yopmail for: ${username}`);
            log(`[SVP-Yopmail] URL: ${yopmailUrl}`);

            // Mark as opened to prevent duplicate tabs
            window.__svp_yopmail_opened = true;

            // Open in new tab
            window.open(yopmailUrl, '_blank');

            log("[SVP-Yopmail] Yopmail tab opened successfully");
        } catch (err) {
            error("[SVP-Yopmail] Error opening Yopmail tab:", err);
        }
    }

    // ─────────────────────────────────────────────
    // handleOtpAutoFill
    // EXACT COPY from SVPInternationalAutomation.handleOtpAutoFill
    // ─────────────────────────────────────────────

    async function handleOtpAutoFill(email) {
        log(`[SVP-OTP] Starting auto OTP fill sequence for: ${email}`);

        // Prevent duplicate handling
        if (window.__svp_otp_handling_in_progress) return;
        window.__svp_otp_handling_in_progress = true;

        let fetchAttempts = 0;
        const MAX_FETCH_ATTEMPTS = 15; // 15 * 5s = 75 seconds total wait

        try {
            const emailMatch = email.match(/^([^@]+)@dakbox\.net$/i);
            if (!emailMatch) throw new Error(`Invalid dakbox.net email format: ${email}`);
            const username = emailMatch[1];

            while (fetchAttempts < MAX_FETCH_ATTEMPTS && !window.__svp_otp_filled) {
                fetchAttempts++;
                log(`[SVP-OTP] Fetch attempt ${fetchAttempts}/${MAX_FETCH_ATTEMPTS} for ${username}...`);

                // Fetch OTP from DakBox API (maxRetries 1 because we loop here)
                const otpResult = await fetchOtpFromDakBox(username, 1);

                if (otpResult.success && otpResult.otp) {
                    log(`[SVP-OTP] OTP fetched successfully: ${otpResult.otp}`);
                    const fillSuccess = await fillVerificationCode(otpResult.otp);
                    if (fillSuccess) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await clickSignInButton();
                        window.__svp_otp_filled = true;
                        log("[SVP-OTP] Auto OTP process completed successfully");
                        break;
                    }
                } else if (otpResult.expired) {
                    log("[SVP-OTP] OTP is already expired on server.");
                }

                if (fetchAttempts < MAX_FETCH_ATTEMPTS) {
                    log("[SVP-OTP] OTP not found yet, waiting 5s...");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            if (!window.__svp_otp_filled) {
                warn("[SVP-OTP] Reached max fetch attempts or failed to fill. Stopping for this page load.");
                // Mark as filled anyway to stop the global observer from restarting this cycle indefinitely
                window.__svp_otp_filled = true;
            }

        } catch (err) {
            error("[SVP-OTP] Auto OTP fill failed:", err);
            window.__svp_otp_filled = true; // Stop observer
        } finally {
            window.__svp_otp_handling_in_progress = false;
        }
    }

    // ─────────────────────────────────────────────
    // handleRegistrationOtpAutoFill
    // EXACT COPY from SVPInternationalAutomation.handleRegistrationOtpAutoFill
    // ─────────────────────────────────────────────

    async function handleRegistrationOtpAutoFill(email) {
        log(`[SVP-RegOTP] Starting auto OTP fill for registration: ${email}`);

        if (window.__svp_reg_otp_handling_in_progress) return;
        window.__svp_reg_otp_handling_in_progress = true;

        let fetchAttempts = 0;
        const MAX_FETCH_ATTEMPTS = 15;

        try {
            const emailMatch = email.match(/^([^@]+)@dakbox\.net$/i);
            if (!emailMatch) throw new Error(`Invalid dakbox.net email format: ${email}`);
            const username = emailMatch[1];

            while (fetchAttempts < MAX_FETCH_ATTEMPTS && !window.__svp_reg_otp_filled) {
                fetchAttempts++;
                log(`[SVP-RegOTP] Fetch attempt ${fetchAttempts}/${MAX_FETCH_ATTEMPTS} for ${username}...`);

                const otpResult = await fetchRegistrationOtp(username, 1);

                if (otpResult.success && otpResult.otp) {
                    log(`[SVP-RegOTP] OTP fetched successfully: ${otpResult.otp}`);
                    const fillSuccess = await fillVerificationCode(otpResult.otp);
                    if (fillSuccess) {
                        window.__svp_reg_otp_filled = true;
                        log("[SVP-RegOTP] Auto OTP process completed successfully (Continue NOT clicked)");
                        break;
                    }
                }

                if (fetchAttempts < MAX_FETCH_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            if (!window.__svp_reg_otp_filled) {
                window.__svp_reg_otp_filled = true; // Stop observer
            }

        } catch (err) {
            error("[SVP-RegOTP] Auto OTP fill failed:", err);
            window.__svp_reg_otp_filled = true;
        } finally {
            window.__svp_reg_otp_handling_in_progress = false;
        }
    }

    // ─────────────────────────────────────────────
    // fetchOtpFromDakBox (via background service worker)
    // Original calls API directly, here we route through background.js
    // because content scripts on svp-international.pacc.sa can't
    // directly CORS-fetch from t2hub.app
    // ─────────────────────────────────────────────

    async function fetchOtpFromDakBox(username, maxRetries = 5) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'fetchOtp', username, maxRetries },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response || { success: false, error: 'No response from background' });
                    }
                }
            );
        });
    }

    // ─────────────────────────────────────────────
    // fetchRegistrationOtp (via background service worker)
    // ─────────────────────────────────────────────

    async function fetchRegistrationOtp(username, maxRetries = 5) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'fetchRegistrationOtp', username, maxRetries },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response || { success: false, error: 'No response from background' });
                    }
                }
            );
        });
    }

    // ─────────────────────────────────────────────
    // fillVerificationCode
    // EXACT COPY from SVPInternationalAutomation.fillVerificationCode
    // ─────────────────────────────────────────────

    async function fillVerificationCode(otp) {
        log(`[SVP-OTP] Filling verification code: ${otp}`);

        try {
            // Convert OTP to string and get individual digits
            const digits = String(otp).split('');
            log(`[SVP-OTP] OTP digits: ${digits.join(', ')} (${digits.length} digits)`);

            // Find verification code input boxes
            // Common patterns: individual inputs with maxlength="1", or inputs in a specific container
            const inputSelectors = [
                // Individual inputs with maxlength 1
                'input[maxlength="1"]',
                // OTP specific inputs
                '.otp-input input',
                '.verification-code input',
                '.code-input input',
                // Element UI style inputs
                '.el-input input[maxlength="1"]',
                // Generic number inputs in verification container
                '[class*="verification"] input',
                '[class*="otp"] input',
                '[class*="code"] input[type="text"]',
                '[class*="code"] input[type="number"]'
            ];

            let inputs = [];

            // Try each selector until we find verification inputs
            for (const selector of inputSelectors) {
                const found = Array.from(document.querySelectorAll(selector));
                if (found.length >= digits.length) {
                    inputs = found.slice(0, digits.length);
                    log(`[SVP-OTP] Found ${found.length} inputs with selector: ${selector}`);
                    break;
                }
            }

            // If still no inputs found, try to find by layout (6 adjacent inputs)
            if (inputs.length < digits.length) {
                const allInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], input:not([type])'));
                const potentialOtpInputs = allInputs.filter(input => {
                    const maxLength = input.getAttribute('maxlength');
                    const isSmall = input.offsetWidth < 80;
                    return (maxLength === '1' || isSmall) && isElementVisible(input);
                });

                if (potentialOtpInputs.length >= digits.length) {
                    inputs = potentialOtpInputs.slice(0, digits.length);
                    log(`[SVP-OTP] Found ${potentialOtpInputs.length} potential OTP inputs via layout analysis`);
                }
            }

            if (inputs.length < digits.length) {
                error(`[SVP-OTP] Not enough verification inputs found. Need ${digits.length}, found ${inputs.length}`);
                return false;
            }

            // Fill each input with corresponding digit
            for (let i = 0; i < digits.length; i++) {
                const input = inputs[i];
                const digit = digits[i];

                log(`[SVP-OTP] Filling input ${i + 1} with digit: ${digit}`);

                // Focus the input
                input.focus();
                await new Promise(resolve => setTimeout(resolve, 50));

                // Clear existing value
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                ).set;

                setter.call(input, '');
                input.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    inputType: 'deleteContentBackward'
                }));

                // Set new value
                setter.call(input, digit);

                // Dispatch comprehensive events
                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: digit }));
                input.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    inputType: 'insertText',
                    data: digit
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: digit }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Small delay between inputs to mimic typing
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Blur the last input
            if (inputs.length > 0) {
                inputs[inputs.length - 1].blur();
            }

            log("[SVP-OTP] All verification code digits filled successfully");
            return true;

        } catch (err) {
            error("[SVP-OTP] Error filling verification code:", err);
            return false;
        }
    }

    // ─────────────────────────────────────────────
    // clickSignInButton
    // EXACT COPY from SVPInternationalAutomation.clickSignInButton
    // ─────────────────────────────────────────────

    async function clickSignInButton() {
        log("[SVP-OTP] Attempting to click Sign in button...");

        try {
            const signInSelectors = [
                // Common sign in button selectors
                'button[type="submit"]',
                'button:contains("Sign in")',
                'button:contains("sign in")',
                '.sign-in-btn',
                '.signin-btn',
                '[data-test-id="signInButton"]',
                '[data-test-id*="signIn"]',
                '[data-test-id*="signin"]',
                '.el-button--primary'
            ];

            let signInButton = null;

            // Try specific selectors first
            for (const selector of signInSelectors) {
                try {
                    const button = document.querySelector(selector);
                    if (button && isElementVisible(button) && !button.disabled) {
                        signInButton = button;
                        log(`[SVP-OTP] Found Sign in button with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // :contains selector might not be supported, continue to next
                }
            }

            // If not found, try text-based search
            if (!signInButton) {
                log("[SVP-OTP] Trying text-based search for Sign in button...");
                const buttons = Array.from(document.querySelectorAll('button, .el-button, [role="button"]'));
                signInButton = buttons.find(btn => {
                    const text = (btn.textContent || btn.innerText || '').toLowerCase().trim();
                    return (text === 'sign in' || text === 'signin' || text.includes('sign in')) &&
                        isElementVisible(btn) && !btn.disabled;
                });

                if (signInButton) {
                    log("[SVP-OTP] Found Sign in button via text search");
                }
            }

            if (!signInButton) {
                warn("[SVP-OTP] Sign in button not found");
                return false;
            }

            // Click the button
            signInButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 300));

            signInButton.click();
            signInButton.dispatchEvent(new Event('click', { bubbles: true }));

            log("[SVP-OTP] Sign in button clicked successfully");
            return true;

        } catch (err) {
            error("[SVP-OTP] Error clicking Sign in button:", err);
            return false;
        }
    }

    // ─────────────────────────────────────────────
    // setupOtpVerificationObserver
    // EXACT COPY from SVPInternationalAutomation.setupOtpVerificationObserver
    // ─────────────────────────────────────────────

    function setupOtpVerificationObserver() {
        log("[SVP-OTP] Setting up OTP verification page observer...");

        // Reset flags for SPA navigation - allow re-checking on each navigation
        window.__svp_otp_filled = false;
        window.__svp_otp_handling_in_progress = false;
        otpCheckAttempts = 0;

        // Clear any existing OTP observer interval
        if (window.__svp_otp_check_interval) {
            clearInterval(window.__svp_otp_check_interval);
            window.__svp_otp_check_interval = null;
        }

        // Check immediately for verification page
        setTimeout(() => {
            checkForOtpVerificationPage();
        }, 1000);

        // Set up periodic checking for SPA navigation (more reliable than MutationObserver alone)
        window.__svp_otp_check_interval = setInterval(() => {
            // Only check if not already filled and on login page
            if (!window.__svp_otp_filled &&
                !window.__svp_otp_handling_in_progress &&
                window.location.href.indexOf("/auth/login") !== -1) {
                checkForOtpVerificationPage();
            }
        }, 2000); // Check every 2 seconds

        // Also set up MutationObserver for faster detection
        if (!window.__svp_otp_mutation_observer) {
            let otpCheckTimeout = null;
            const otpObserver = new MutationObserver((mutations) => {
                // Only check if not already handling OTP and on login page
                if (!window.__svp_otp_handling_in_progress &&
                    !window.__svp_otp_filled &&
                    window.location.href.indexOf("/auth/login") !== -1) {
                    // Debounce the check
                    if (otpCheckTimeout) {
                        clearTimeout(otpCheckTimeout);
                    }
                    otpCheckTimeout = setTimeout(() => {
                        checkForOtpVerificationPage();
                    }, 500);
                }
            });

            otpObserver.observe(document.body, {
                childList: true,
                subtree: true
            });

            window.__svp_otp_mutation_observer = otpObserver;
        }

        log("[SVP-OTP] OTP verification observer initialized (SPA-aware)");
    }

    // ─────────────────────────────────────────────
    // setupRegistrationOtpObserver
    // EXACT COPY from SVPInternationalAutomation.setupRegistrationOtpObserver
    // ─────────────────────────────────────────────

    function setupRegistrationOtpObserver() {
        log("[SVP-RegOTP] Setting up Registration OTP verification observer...");

        // Reset flags for fresh detection
        window.__svp_reg_otp_filled = false;
        window.__svp_reg_otp_handling_in_progress = false;
        regOtpCheckAttempts = 0;

        // Clear any existing interval
        if (window.__svp_reg_otp_check_interval) {
            clearInterval(window.__svp_reg_otp_check_interval);
            window.__svp_reg_otp_check_interval = null;
        }

        // Check immediately
        setTimeout(() => {
            checkForRegistrationOtpPage();
        }, 1000);

        // Set up periodic checking
        window.__svp_reg_otp_check_interval = setInterval(() => {
            if (!window.__svp_reg_otp_filled &&
                !window.__svp_reg_otp_handling_in_progress &&
                window.location.href.indexOf("/auth/register") !== -1) {
                checkForRegistrationOtpPage();
            }
        }, 2000);

        // Also set up MutationObserver for faster detection
        if (!window.__svp_reg_otp_mutation_observer) {
            let regOtpCheckTimeout = null;
            const regOtpObserver = new MutationObserver((mutations) => {
                if (!window.__svp_reg_otp_handling_in_progress &&
                    !window.__svp_reg_otp_filled &&
                    window.location.href.indexOf("/auth/register") !== -1) {
                    if (regOtpCheckTimeout) {
                        clearTimeout(regOtpCheckTimeout);
                    }
                    regOtpCheckTimeout = setTimeout(() => {
                        checkForRegistrationOtpPage();
                    }, 500);
                }
            });

            regOtpObserver.observe(document.body, {
                childList: true,
                subtree: true
            });

            window.__svp_reg_otp_mutation_observer = regOtpObserver;
        }

        log("[SVP-RegOTP] Registration OTP observer initialized");
    }

    // ─────────────────────────────────────────────
    // Initialize - same as original initializeAutomation
    // Sets up both observers when script loads
    // ─────────────────────────────────────────────

    log(`[DakBox-SVP] SVP OTP content script loaded on: ${location.href}`);

    // Reset dakbox/yopmail opened flags
    window.__svp_dakbox_opened = false;
    window.__svp_yopmail_opened = false;

    // Initialize both observers (same as original)
    if (document.body) {
        setupOtpVerificationObserver();
        setupRegistrationOtpObserver();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setupOtpVerificationObserver();
            setupRegistrationOtpObserver();
        });
    }

    // Watch for URL changes (SPA navigation) and re-initialize observers
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            log(`[DakBox-SVP] URL changed: ${lastUrl} → ${location.href}`);
            lastUrl = location.href;

            // Reset dakbox/yopmail opened flags on navigation
            window.__svp_dakbox_opened = false;
            window.__svp_yopmail_opened = false;

            // Re-initialize observers for the new page
            setupOtpVerificationObserver();
            setupRegistrationOtpObserver();
        }
    }, 500);

})();
