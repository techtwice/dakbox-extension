/**
 * DakBox SVP OTP Content Script
 * Runs on svp-international.pacc.sa to auto-detect dakbox.net emails,
 * open DakBox inbox, and auto-fill OTP verification codes
 *
 * Extracted from SVPInternationalAutomation in manpowerAI3.0
 */

(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.__dakbox_svp_loaded) return;
    window.__dakbox_svp_loaded = true;

    // ─────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────

    const LOG_PREFIX = '[DakBox-SVP]';
    let autoOtpEnabled = true;
    let autoOpenInbox = true;

    // Load settings
    chrome.storage.local.get(['dakboxAutoOtpEnabled', 'dakboxAutoOpenInbox'], (data) => {
        autoOtpEnabled = data.dakboxAutoOtpEnabled !== false; // default true
        autoOpenInbox = data.dakboxAutoOpenInbox !== false; // default true
        console.log(`${LOG_PREFIX} Settings loaded - Auto OTP: ${autoOtpEnabled}, Auto Open: ${autoOpenInbox}`);
    });

    // ─────────────────────────────────────────────
    // OTP Verification Page Detection
    // Extracted from checkForOtpVerificationPage
    // ─────────────────────────────────────────────

    function checkForOtpVerificationPage() {
        const pageText = document.body?.innerText || '';

        // Check for "Welcome back" login verification page
        const isWelcomePage = pageText.includes('Welcome back');
        const hasVerificationText = pageText.includes('verification') ||
            pageText.includes('Verification') ||
            pageText.includes('verify');

        // Check for verification code inputs (6 individual inputs)
        const verificationInputs = document.querySelectorAll('input[maxlength="1"]');
        const hasVerificationInputs = verificationInputs.length >= 4;

        // Look for dakbox.net email in specific elements
        let dakboxEmail = null;

        // Method 1: Check all text elements for dakbox.net email pattern
        const allElements = document.querySelectorAll('span, p, div, td, label, h1, h2, h3, h4, h5, h6');
        for (const el of allElements) {
            const text = (el.textContent || '').trim();
            const emailRegex = /^([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)$/i;
            const match = text.match(emailRegex);
            if (match) {
                dakboxEmail = match[1];
                console.log(`${LOG_PREFIX} Found dakbox.net email in element: ${dakboxEmail}`);
                break;
            }
        }

        // Method 2: Search in full page text
        if (!dakboxEmail) {
            const emailMatch = pageText.match(/(?:to\s+)([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (emailMatch) {
                dakboxEmail = emailMatch[1];
                console.log(`${LOG_PREFIX} Found dakbox.net email via page text: ${dakboxEmail}`);
            }
        }

        // Method 3: Check for standalone dakbox email pattern
        if (!dakboxEmail) {
            const standaloneMatch = pageText.match(/([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (standaloneMatch) {
                dakboxEmail = standaloneMatch[1];
                console.log(`${LOG_PREFIX} Found dakbox.net email (standalone): ${dakboxEmail}`);
            }
        }

        if ((isWelcomePage || hasVerificationText) && (hasVerificationInputs || dakboxEmail)) {
            console.log(`${LOG_PREFIX} OTP verification page detected!`);

            if (dakboxEmail) {
                console.log(`${LOG_PREFIX} DakBox email found on page: ${dakboxEmail}`);

                // Open DakBox inbox in new tab if not already opened
                if (autoOpenInbox && !window.__dakbox_inbox_opened) {
                    console.log(`${LOG_PREFIX} Opening DakBox inbox for: ${dakboxEmail}`);
                    openDakboxTab(dakboxEmail);
                }

                // Auto-fill OTP if enabled
                if (autoOtpEnabled) {
                    handleOtpAutoFill(dakboxEmail);
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // Registration OTP Page Detection
    // Extracted from checkForRegistrationOtpPage
    // ─────────────────────────────────────────────

    function checkForRegistrationOtpPage() {
        const pageText = document.body?.innerText || '';

        // Check for registration verification indicators
        const hasAccountVerification = pageText.includes('Account Verification') ||
            pageText.includes('Email verification') ||
            pageText.includes('Verify your email');

        if (!hasAccountVerification) return;

        // Find dakbox.net email on the page
        let dakboxEmail = null;
        const allElements = document.querySelectorAll('span, p, div, td, label');
        for (const el of allElements) {
            const text = (el.textContent || '').trim();
            const emailRegex = /^([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)$/i;
            const match = text.match(emailRegex);
            if (match) {
                dakboxEmail = match[1];
                console.log(`${LOG_PREFIX} Found dakbox.net email on registration page: ${dakboxEmail}`);
                break;
            }
        }

        if (!dakboxEmail) {
            const emailMatch = pageText.match(/(?:to\s+)([a-zA-Z0-9][a-zA-Z0-9._%+-]*@dakbox\.net)/i);
            if (emailMatch) {
                dakboxEmail = emailMatch[1];
            }
        }

        if (dakboxEmail) {
            console.log(`${LOG_PREFIX} Registration OTP page with DakBox email detected!`);

            // Open inbox
            if (autoOpenInbox && !window.__dakbox_inbox_opened) {
                openDakboxTab(dakboxEmail);
            }

            // Auto-fill registration OTP
            if (autoOtpEnabled) {
                handleRegistrationOtpAutoFill(dakboxEmail);
            }
        }
    }

    // ─────────────────────────────────────────────
    // Open DakBox Tab
    // Extracted from SVPInternationalAutomation.openDakboxTab
    // ─────────────────────────────────────────────

    function openDakboxTab(email) {
        try {
            const match = email.match(/^([^@]+)@dakbox\.net$/i);
            if (!match) {
                console.error(`${LOG_PREFIX} Invalid dakbox.net email format:`, email);
                return;
            }

            const username = match[1];
            const dakboxUrl = `https://dakbox.net/go/${username}`;

            console.log(`${LOG_PREFIX} Opening DakBox for: ${username}`);
            window.__dakbox_inbox_opened = true;
            window.open(dakboxUrl, '_blank');
            console.log(`${LOG_PREFIX} DakBox tab opened successfully`);
        } catch (error) {
            console.error(`${LOG_PREFIX} Error opening DakBox tab:`, error);
        }
    }

    // ─────────────────────────────────────────────
    // Handle Login OTP Auto-Fill
    // Extracted from SVPInternationalAutomation.handleOtpAutoFill
    // ─────────────────────────────────────────────

    async function handleOtpAutoFill(email) {
        console.log(`${LOG_PREFIX} Starting auto OTP fill for: ${email}`);

        if (window.__dakbox_otp_handling) {
            console.log(`${LOG_PREFIX} OTP handling already in progress`);
            return;
        }
        window.__dakbox_otp_handling = true;

        try {
            const emailMatch = email.match(/^([^@]+)@dakbox\.net$/i);
            if (!emailMatch) {
                throw new Error(`Invalid dakbox.net email format: ${email}`);
            }
            const username = emailMatch[1];
            console.log(`${LOG_PREFIX} Extracted username: ${username}`);

            // Wait for OTP email to arrive
            console.log(`${LOG_PREFIX} Waiting 3 seconds for OTP email...`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Fetch OTP via background service worker
            const otpResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'fetchOtp', username },
                    resolve
                );
            });

            if (!otpResult || !otpResult.success) {
                throw new Error(otpResult?.error || 'Failed to fetch OTP');
            }

            console.log(`${LOG_PREFIX} OTP fetched successfully: ${otpResult.otp}`);

            // Fill the verification code inputs
            const fillSuccess = await fillVerificationCode(otpResult.otp);
            if (!fillSuccess) {
                throw new Error('Failed to fill verification code inputs');
            }

            console.log(`${LOG_PREFIX} Verification code filled successfully`);

            // Wait then click Sign in button
            await new Promise(resolve => setTimeout(resolve, 500));
            await clickSignInButton();

            window.__dakbox_otp_filled = true;
            console.log(`${LOG_PREFIX} Auto OTP process completed!`);

        } catch (error) {
            console.error(`${LOG_PREFIX} Auto OTP fill failed:`, error);
        } finally {
            window.__dakbox_otp_handling = false;
        }
    }

    // ─────────────────────────────────────────────
    // Handle Registration OTP Auto-Fill
    // Extracted from SVPInternationalAutomation.handleRegistrationOtpAutoFill
    // ─────────────────────────────────────────────

    async function handleRegistrationOtpAutoFill(email) {
        console.log(`${LOG_PREFIX} Starting registration OTP fill for: ${email}`);

        if (window.__dakbox_reg_otp_handling) {
            console.log(`${LOG_PREFIX} Registration OTP handling already in progress`);
            return;
        }
        window.__dakbox_reg_otp_handling = true;

        try {
            const emailMatch = email.match(/^([^@]+)@dakbox\.net$/i);
            if (!emailMatch) {
                throw new Error(`Invalid dakbox.net email format: ${email}`);
            }
            const username = emailMatch[1];

            // Wait for OTP email to arrive
            console.log(`${LOG_PREFIX} Waiting 3 seconds for registration OTP email...`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Fetch registration OTP
            const otpResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'fetchRegistrationOtp', username },
                    resolve
                );
            });

            if (!otpResult || !otpResult.success) {
                throw new Error(otpResult?.error || 'Failed to fetch registration OTP');
            }

            console.log(`${LOG_PREFIX} Registration OTP fetched: ${otpResult.otp}`);

            const fillSuccess = await fillVerificationCode(otpResult.otp);
            if (!fillSuccess) {
                throw new Error('Failed to fill verification code inputs');
            }

            console.log(`${LOG_PREFIX} Registration OTP filled (Continue NOT clicked - user handles reCAPTCHA)`);
            window.__dakbox_reg_otp_filled = true;

        } catch (error) {
            console.error(`${LOG_PREFIX} Registration OTP fill failed:`, error);
        } finally {
            window.__dakbox_reg_otp_handling = false;
        }
    }

    // ─────────────────────────────────────────────
    // Fill Verification Code
    // Extracted from SVPInternationalAutomation.fillVerificationCode
    // ─────────────────────────────────────────────

    async function fillVerificationCode(otp) {
        console.log(`${LOG_PREFIX} Filling verification code: ${otp}`);

        const digits = otp.toString().split('');

        // Strategy 1: Individual single-character inputs
        let inputs = document.querySelectorAll('input[maxlength="1"]');

        if (inputs.length === 0) {
            // Strategy 2: Look in shadow DOM or nested containers
            const containers = document.querySelectorAll('[class*="verification"], [class*="otp"], [class*="code"]');
            for (const container of containers) {
                inputs = container.querySelectorAll('input');
                if (inputs.length >= 4) break;
            }
        }

        if (inputs.length === 0) {
            // Strategy 3: Look for a single input that takes full OTP
            const singleInput = document.querySelector('input[type="text"][maxlength="6"], input[type="number"][maxlength="6"]');
            if (singleInput) {
                setNativeValue(singleInput, otp);
                triggerInputEvents(singleInput);
                console.log(`${LOG_PREFIX} Filled single OTP input`);
                return true;
            }
        }

        if (inputs.length >= digits.length) {
            for (let i = 0; i < digits.length; i++) {
                const input = inputs[i];
                setNativeValue(input, digits[i]);
                triggerInputEvents(input);

                // Small delay between digit fills to mimic typing
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            console.log(`${LOG_PREFIX} Filled ${digits.length} verification code inputs`);
            return true;
        }

        // Fallback: try filling all available inputs
        if (inputs.length > 0) {
            for (let i = 0; i < Math.min(inputs.length, digits.length); i++) {
                setNativeValue(inputs[i], digits[i]);
                triggerInputEvents(inputs[i]);
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return true;
        }

        console.error(`${LOG_PREFIX} Could not find verification code inputs`);
        return false;
    }

    // ─────────────────────────────────────────────
    // Click Sign In Button
    // Extracted from SVPInternationalAutomation.clickSignInButton
    // ─────────────────────────────────────────────

    async function clickSignInButton() {
        console.log(`${LOG_PREFIX} Looking for Sign In button...`);

        const selectors = [
            'button[type="submit"]',
            'button:contains("Sign in")',
            'button:contains("Verify")',
            'button:contains("Submit")',
            'button:contains("Continue")',
            'input[type="submit"]'
        ];

        // Try standard selectors first
        for (const selector of selectors) {
            try {
                const btn = document.querySelector(selector);
                if (btn && btn.offsetParent !== null) {
                    console.log(`${LOG_PREFIX} Found button with selector: ${selector}`);
                    btn.click();
                    return true;
                }
            } catch (e) {
                // :contains is not standard CSS, handle below
            }
        }

        // Try text-based search
        const buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
        for (const btn of buttons) {
            const text = (btn.textContent || btn.value || '').trim().toLowerCase();
            if (['sign in', 'verify', 'submit', 'continue', 'confirm'].some(t => text.includes(t))) {
                if (btn.offsetParent !== null) {
                    console.log(`${LOG_PREFIX} Found button by text: "${text}"`);
                    btn.click();
                    return true;
                }
            }
        }

        console.warn(`${LOG_PREFIX} Sign In button not found`);
        return false;
    }

    // ─────────────────────────────────────────────
    // DOM Utility Functions
    // ─────────────────────────────────────────────

    function setNativeValue(element, value) {
        const valueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        valueSetter.call(element, value);
    }

    function triggerInputEvents(element) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    // ─────────────────────────────────────────────
    // Page Observer - Watch for OTP Page Transitions
    // ─────────────────────────────────────────────

    function setupPageObserver() {
        // Initial check
        setTimeout(() => {
            checkForOtpVerificationPage();
            checkForRegistrationOtpPage();
        }, 2000);

        // Watch for page changes (SPA navigation)
        const observer = new MutationObserver(() => {
            // Debounce checks
            if (window.__dakbox_check_timer) {
                clearTimeout(window.__dakbox_check_timer);
            }
            window.__dakbox_check_timer = setTimeout(() => {
                if (!window.__dakbox_otp_filled && !window.__dakbox_otp_handling) {
                    checkForOtpVerificationPage();
                }
                if (!window.__dakbox_reg_otp_filled && !window.__dakbox_reg_otp_handling) {
                    checkForRegistrationOtpPage();
                }
            }, 1000);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Also watch URL changes
        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                // Reset states on URL change
                window.__dakbox_otp_filled = false;
                window.__dakbox_otp_handling = false;
                window.__dakbox_reg_otp_filled = false;
                window.__dakbox_reg_otp_handling = false;
                window.__dakbox_inbox_opened = false;

                setTimeout(() => {
                    checkForOtpVerificationPage();
                    checkForRegistrationOtpPage();
                }, 2000);
            }
        });
        urlObserver.observe(document, { subtree: true, childList: true });
    }

    // ─────────────────────────────────────────────
    // Initialize
    // ─────────────────────────────────────────────

    console.log(`${LOG_PREFIX} SVP OTP content script loaded`);
    setupPageObserver();

})();
