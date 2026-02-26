/**
 * DakBox Auto Random Email Generator
 * Automatically identifies email input fields and injects a button to generate
 * a random temporary DakBox email address instantly.
 */

(function () {
    'use strict';

    if (window.__dakbox_generator_loaded) return;
    window.__dakbox_generator_loaded = true;

    // ─────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────

    // Use this to specify exact selectors for specific websites.
    // Format: "hostname": "css-selector"
    const SITE_CONFIG = {
        "example.com": "#user_email",
        "anothersite.org": "input[name='email']",
        "complexsite.net": ".login-form .email-field"
        // Add your custom sites and selectors here!
    };

    // The domain to use for generated emails
    const DAKBOX_DOMAIN = "dakbox.net";

    // ─────────────────────────────────────────────
    // Styles
    // ─────────────────────────────────────────────

    // Inject the CSS required for the generator icon
    const style = document.createElement('style');
    style.textContent = `
        .dakbox-gen-wrapper {
            position: relative;
            display: inline-block;
            width: 100%;
        }
        
        .dakbox-gen-btn {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            width: 24px;
            height: 24px;
            background-color: transparent;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: all 0.2s ease;
            box-shadow: none !important;
            outline: none !important;
        }

        .dakbox-gen-btn:hover {
            background-color: rgba(33, 150, 243, 0.1);
        }

        .dakbox-gen-btn svg {
            width: 16px;
            height: 16px;
            fill: #2196F3;
            transition: transform 0.2s ease;
        }

        .dakbox-gen-btn:active svg {
            transform: scale(0.9);
        }

        /* Tooltip */
        .dakbox-gen-btn::before {
            content: 'Generate DakBox Email';
            position: absolute;
            bottom: 100%;
            right: 0;
            margin-bottom: 8px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transition: all 0.2s ease;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        }

        .dakbox-gen-btn:hover::before {
            opacity: 1;
            visibility: visible;
        }
    `;
    document.head.appendChild(style);

    // SVG icon for the button (a dice/random icon)
    const GENERATOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.67 6 16.5 6s1.5.67 1.5 1.5S17.33 9 16.5 9z"/></svg>`;

    // ─────────────────────────────────────────────
    // Core Logic
    // ─────────────────────────────────────────────

    // Generate a random string of specified length
    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const randomValues = new Uint32Array(length);
        window.crypto.getRandomValues(randomValues);
        for (let i = 0; i < length; i++) {
            result += chars[randomValues[i] % chars.length];
        }
        return result;
    }

    // Fill the input field and dispatch necessary events
    function fillEmailInput(inputElement) {
        const randomUsername = generateRandomString(10); // 10 chars is usually safe and unique
        const email = `${randomUsername}@${DAKBOX_DOMAIN}`;

        // Focus the input
        inputElement.focus();

        // Use native setter to bypass React/Vue control
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(inputElement, email);

        // Dispatch comprehensive events to ensure the site registers the change
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));

        // Optional: Save this generated email to extension storage for easy access later
        try {
            chrome.storage.local.set({ dakboxLastGeneratedEmail: email, dakboxLastUsername: randomUsername });
        } catch (e) {
            console.warn("[DakBox Generator] Could not save generated email to storage", e);
        }

        console.log(`[DakBox Generator] Filled email: ${email}`);
    }

    // Inject the generator icon into the target input field
    function injectGeneratorIcon(inputElement) {
        // Prevent duplicate injections
        if (inputElement.dataset.dakboxInjected === "true") return;

        // Ensure the input actually is visible and has a parent
        if (!inputElement.parentElement || inputElement.offsetParent === null) return;

        inputElement.dataset.dakboxInjected = "true";

        // Create the button
        const btn = document.createElement('button');
        btn.className = 'dakbox-gen-btn';
        btn.innerHTML = GENERATOR_ICON;
        btn.type = 'button'; // Prevent form submission
        btn.tabIndex = -1; // Keep out of tab order

        // We wrap the input element in a relative container so our absolute positioned icon works perfectly
        // BUT we must be careful not to break existing layouts

        // We will just position the button absolutely inside the parent element
        // IF the parent is roughly the same size as the input. Otherwise, we might need a wrapper.

        // For maximum compatibility without wrappers (which breaks flex/grid):
        // Position the button absolutely relative to the offsetParent, matching the input's coordinates

        const updatePosition = () => {
            const inputRect = inputElement.getBoundingClientRect();
            const parentRect = btn.offsetParent ? btn.offsetParent.getBoundingClientRect() : { top: 0, left: 0 };

            // If input is hidden (e.g. display:none), hide button
            if (inputRect.width === 0 || inputRect.height === 0) {
                btn.style.display = 'none';
                return;
            }

            btn.style.display = 'flex';

            // Calculate absolute position relative to the offset parent
            const top = (inputRect.top - parentRect.top) + (inputRect.height / 2);
            const right = (parentRect.right - inputRect.right) + 8; // 8px padding from the right edge of input target

            // Important: Using offsetParent coordinate system
            let btnTop = inputElement.offsetTop + (inputElement.offsetHeight / 2);
            let btnLeft = inputElement.offsetLeft + inputElement.offsetWidth - 28; // 24px width + 4px padding

            btn.style.position = 'absolute';
            btn.style.top = btnTop + 'px';
            btn.style.left = btnLeft + 'px';
            btn.style.transform = 'translateY(-50%)';
        };

        // Find the closest positioned ancestor, or make the parent positioned
        let container = inputElement.parentElement;
        const computedStyle = window.getComputedStyle(container);
        if (computedStyle.position === 'static') {
            container.style.position = 'relative';
        }

        // If the container is too tall, we use the input element directly to calculate position
        btn.style.position = 'absolute';

        container.appendChild(btn);

        // Initial position
        updatePosition();

        // Re-position on resize or scroll in case the layout changes
        window.addEventListener('resize', updatePosition);

        // Add padding to the input so text doesn't hide behind the button
        const currentPaddingRight = parseInt(window.getComputedStyle(inputElement).paddingRight || '0', 10);
        if (currentPaddingRight < 30) {
            inputElement.style.paddingRight = '30px';
        }

        // Handle click event
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fillEmailInput(inputElement);
        });

        // Prevent enter key on button from submitting form if button receives focus somehow
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                fillEmailInput(inputElement);
            }
        });
    }

    // ─────────────────────────────────────────────
    // Detection Logic
    // ─────────────────────────────────────────────

    let autoGenerateEnabled = true; // Default to true

    function scanInputs() {
        if (!autoGenerateEnabled) return;

        const hostname = window.location.hostname;
        let targetInputs = [];

        // 1. Check Site Config first
        if (SITE_CONFIG[hostname]) {
            const configuredInputs = document.querySelectorAll(SITE_CONFIG[hostname]);
            configuredInputs.forEach(input => targetInputs.push(input));
        }

        // 2. Auto-detection fallback
        if (targetInputs.length === 0) {
            // Find all inputs that might be emails
            const potentialInputs = document.querySelectorAll(
                'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]'
            );

            potentialInputs.forEach(input => {
                // Ignore hidden inputs or disabled inputs
                if (input.type === 'hidden' || input.disabled || input.readOnly) return;
                targetInputs.push(input);
            });
        }

        // Inject icons into all found targets
        targetInputs.forEach(input => {
            if (!input.dataset.dakboxInjected) {
                injectGeneratorIcon(input);
            }
        });
    }

    // Read initial settings
    chrome.storage.local.get(['dakboxAutoGenerate'], (data) => {
        if (data.dakboxAutoGenerate !== undefined) {
            autoGenerateEnabled = data.dakboxAutoGenerate;
        }

        // Wait a second for initial render before first scan
        if (autoGenerateEnabled) {
            setTimeout(scanInputs, 1000);
        }
    });

    // Listen for real-time settings changes from the popup
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.dakboxAutoGenerate) {
            autoGenerateEnabled = changes.dakboxAutoGenerate.newValue !== false;

            if (autoGenerateEnabled) {
                // Instantly scan when enabled
                scanInputs();
            } else {
                // Optionally remove icons when disabled (clean up)
                document.querySelectorAll('.dakbox-gen-btn').forEach(btn => btn.remove());
                document.querySelectorAll('[data-dakbox-injected="true"]').forEach(input => {
                    delete input.dataset.dakboxInjected;
                    input.style.paddingRight = ''; // Reset padding
                });
            }
        }
    });

    // Set up MutationObserver to catch dynamically added inputs (e.g. Single Page Apps)
    const observer = new MutationObserver((mutations) => {
        let shouldScan = false;
        for (let mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                // Only scan if actual element nodes were added
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    if (mutation.addedNodes[i].nodeType === 1) { // ELEMENT_NODE
                        shouldScan = true;
                        break;
                    }
                }
            }
            if (shouldScan) break;
        }

        if (shouldScan) {
            // Debounce the scan
            clearTimeout(window.__dakbox_scan_timeout);
            window.__dakbox_scan_timeout = setTimeout(scanInputs, 500);
        }
    });

    // Start observing DOM changes
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
            scanInputs();
        });
    }

    console.log("[DakBox Generator] Email Generator initialized");

})();
