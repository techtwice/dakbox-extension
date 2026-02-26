/**
 * DakBox Element Picker Content Script
 * Injected on demand to allow users to click an element and get its CSS selector.
 */

(function () {
    'use strict';

    if (window.__dakbox_picker_active) return;
    window.__dakbox_picker_active = true;

    console.log("[DakBox Picker] Activating element picker...");

    // Create the overlay container for the UI
    const pickerUi = document.createElement('div');
    pickerUi.id = 'dakbox-picker-ui';
    pickerUi.innerHTML = `
        <div class="dakbox-picker-header">
            <div class="dakbox-picker-title">DakBox Element Picker Active</div>
            <div class="dakbox-picker-desc">Hover over the element you want to select and click it.</div>
        </div>
        <button id="dakbox-picker-cancel">Cancel</button>
    `;
    document.body.appendChild(pickerUi);

    // Create highlight box
    const highlightBox = document.createElement('div');
    highlightBox.id = 'dakbox-picker-highlight';
    document.body.appendChild(highlightBox);

    let currentTarget = null;

    // --- Event Listeners ---

    function handleMouseMove(e) {
        // Ignore our own UI
        if (e.target.closest('#dakbox-picker-ui') || e.target.id === 'dakbox-picker-highlight') {
            highlightBox.style.display = 'none';
            currentTarget = null;
            return;
        }

        currentTarget = e.target;
        const rect = currentTarget.getBoundingClientRect();

        // Update highlight box position and size
        highlightBox.style.display = 'block';
        highlightBox.style.top = (rect.top + window.scrollY) + 'px';
        highlightBox.style.left = (rect.left + window.scrollX) + 'px';
        highlightBox.style.width = rect.width + 'px';
        highlightBox.style.height = rect.height + 'px';
    }

    function handleClick(e) {
        // Allow clicking cancel button
        if (e.target.id === 'dakbox-picker-cancel') {
            e.preventDefault();
            e.stopPropagation();
            cancelPicker();
            return;
        }

        // Prevent default click behavior on the page
        e.preventDefault();
        e.stopPropagation();

        if (currentTarget) {
            const selector = generateSelector(currentTarget);
            console.log("[DakBox Picker] Element selected:", selector);

            // Send back to extension
            chrome.runtime.sendMessage({
                action: 'dakboxPickerResult',
                selector: selector
            });

            cleanup();
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            cancelPicker();
        }
    }

    function cancelPicker() {
        console.log("[DakBox Picker] Picker cancelled");
        chrome.runtime.sendMessage({
            action: 'dakboxPickerResult',
            selector: null,
            cancelled: true
        });
        cleanup();
    }

    // --- Selector Generation ---

    function generateSelector(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';

        // Optimization: if the element has an ID, that's usually the best
        if (el.id && !/^[0-9]/.test(el.id)) {
            return '#' + CSS.escape(el.id);
        }

        const path = [];
        let current = el;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.nodeName.toLowerCase();

            // 1. Check ID
            if (current.id && !/^[0-9]/.test(current.id)) {
                selector = '#' + CSS.escape(current.id);
                path.unshift(selector);
                break; // IDs should be unique, we can stop going up
            }

            // 2. Determine best internal descriptor for current node
            let nodeDescriptor = selector;

            // 2a. Check Name Attribute (especially good for inputs)
            if (current.name) {
                nodeDescriptor += `[name="${CSS.escape(current.name)}"]`;
            }
            // 2b. Check Classes
            else if (current.className && typeof current.className === 'string') {
                const classes = current.className.split(/\s+/).filter(c =>
                    c && !c.includes('active') && !c.includes('hover') && !c.includes('focus') && !/[0-9]{3,}/.test(c)
                );
                if (classes.length > 0) {
                    nodeDescriptor += '.' + classes.map(c => CSS.escape(c)).join('.');
                }
            }

            // 3. Do we need nth-of-type for disambiguation?
            // If the descriptor is not unique among siblings, add nth-of-type
            let needsNth = false;
            let nth = 1;
            let sibling = current;

            while (sibling = sibling.previousElementSibling) {
                if (sibling.nodeName.toLowerCase() === selector) {
                    needsNth = true;
                    nth++;
                }
            }
            if (current.nextElementSibling) {
                let nextSib = current;
                while (nextSib = nextSib.nextElementSibling) {
                    if (nextSib.nodeName.toLowerCase() === selector) {
                        needsNth = true;
                        break;
                    }
                }
            }

            if (needsNth) {
                nodeDescriptor += `:nth-of-type(${nth})`;
            }

            path.unshift(nodeDescriptor);

            // 4. Check if the path so far is globally unique. If yes, stop.
            const currentSelector = path.join(' > ');
            try {
                if (document.querySelectorAll(currentSelector).length === 1) {
                    return currentSelector; // Found a short, unique path!
                }
            } catch (e) {
                // Ignore invalid selectors during typing
            }

            current = current.parentNode;
        }

        return path.join(' > ');
    }

    // --- Setup & Teardown ---

    function cleanup() {
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);

        if (pickerUi && pickerUi.parentNode) pickerUi.parentNode.removeChild(pickerUi);
        if (highlightBox && highlightBox.parentNode) highlightBox.parentNode.removeChild(highlightBox);

        window.__dakbox_picker_active = false;
    }

    // Use capture phase to intercept before page scripts
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);

})();
