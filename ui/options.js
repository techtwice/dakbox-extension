/**
 * DakBox Options Script
 * Handles custom Site Config management
 */

document.addEventListener('DOMContentLoaded', () => {
    const domainInput = document.getElementById('domain-input');
    const selectorInput = document.getElementById('selector-input');
    const saveBtn = document.getElementById('save-btn');
    const configTbody = document.getElementById('config-tbody');
    const emptyState = document.getElementById('empty-state');
    const statusMessage = document.getElementById('status-message');

    let siteConfig = {};
    let editingDomain = null;

    // --- OTP Config Elements ---
    const otpDomainInput = document.getElementById('otp-domain-input');
    const otpEmailInput = document.getElementById('otp-email-input');
    const otpTriggerInput = document.getElementById('otp-trigger-input');
    const otpBoxInput = document.getElementById('otp-box-input');
    const otpExpiryInput = document.getElementById('otp-expiry-input');
    const otpSaveBtn = document.getElementById('otp-save-btn');
    const otpConfigTbody = document.getElementById('otp-config-tbody');
    const otpEmptyState = document.getElementById('otp-empty-state');

    let otpSiteConfig = {};
    let editingOtpDomain = null;

    // Load existing config
    function loadConfig() {
        chrome.storage.local.get(['dakboxSiteConfig', 'dakboxOtpSiteConfig'], (data) => {
            siteConfig = data.dakboxSiteConfig || {};
            otpSiteConfig = data.dakboxOtpSiteConfig || {};
            renderTable();
            renderOtpTable();
        });
    }

    // Save config back to storage
    function saveConfig(callback) {
        chrome.storage.local.set({
            dakboxSiteConfig: siteConfig,
            dakboxOtpSiteConfig: otpSiteConfig
        }, () => {
            if (callback) callback();
        });
    }

    // Render the table
    function renderTable() {
        configTbody.innerHTML = '';
        const domains = Object.keys(siteConfig);

        if (domains.length === 0) {
            emptyState.style.display = 'block';
            document.getElementById('config-table').style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            document.getElementById('config-table').style.display = 'table';

            domains.sort().forEach(domain => {
                // Legacy migration
                let config = siteConfig[domain];
                if (typeof config === 'string') {
                    config = { selector: config, enabled: true };
                    siteConfig[domain] = config;
                }

                const tr = document.createElement('tr');
                if (!config.enabled) tr.style.opacity = '0.5';

                const tdDomain = document.createElement('td');
                tdDomain.textContent = domain;

                const tdSelector = document.createElement('td');
                const code = document.createElement('code');
                code.style.background = 'rgba(0,0,0,0.3)';
                code.style.padding = '4px 6px';
                code.style.borderRadius = '4px';
                code.textContent = config.selector;
                tdSelector.appendChild(code);

                const tdActions = document.createElement('td');
                tdActions.className = 'actions';
                tdActions.style.alignItems = 'center';

                const toggleLabel = document.createElement('label');
                toggleLabel.className = 'compact-toggle';
                toggleLabel.title = config.enabled ? "Disable this rule" : "Enable this rule";
                const toggleInput = document.createElement('input');
                toggleInput.type = 'checkbox';
                toggleInput.checked = config.enabled;
                toggleInput.onchange = () => toggleEntryEnable(domain, toggleInput.checked);
                const toggleSlider = document.createElement('span');
                toggleSlider.className = 'compact-slider';
                toggleLabel.appendChild(toggleInput);
                toggleLabel.appendChild(toggleSlider);

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.innerHTML = '✏️ Edit';
                editBtn.onclick = () => editEntry(domain);

                const delBtn = document.createElement('button');
                delBtn.className = 'danger';
                delBtn.innerHTML = '🗑️ Delete';
                delBtn.onclick = () => deleteEntry(domain);

                tdActions.appendChild(toggleLabel);
                tdActions.appendChild(editBtn);
                tdActions.appendChild(delBtn);

                tr.appendChild(tdDomain);
                tr.appendChild(tdSelector);
                tr.appendChild(tdActions);

                configTbody.appendChild(tr);
            });
        }
    }

    // Render the OTP table
    function renderOtpTable() {
        otpConfigTbody.innerHTML = '';
        const domains = Object.keys(otpSiteConfig);

        if (domains.length === 0) {
            otpEmptyState.style.display = 'block';
            document.getElementById('otp-config-table').style.display = 'none';
        } else {
            otpEmptyState.style.display = 'none';
            document.getElementById('otp-config-table').style.display = 'table';

            domains.sort().forEach(domain => {
                const config = otpSiteConfig[domain];
                // Legacy migration
                if (config.enabled === undefined) config.enabled = true;

                const tr = document.createElement('tr');
                if (!config.enabled) tr.style.opacity = '0.5';

                const tdDomain = document.createElement('td');
                tdDomain.textContent = domain;

                const tdSelectors = document.createElement('td');
                tdSelectors.innerHTML = `
                    <div style="font-size: 12px; margin-bottom: 4px;">
                        <span style="color: var(--text-muted)">Email:</span> <code>${config.emailSelector}</code>
                    </div>
                    <div style="font-size: 12px; margin-bottom: 4px;">
                        <span style="color: var(--text-muted)">Trigger:</span> <code>${config.triggerSelector}</code>
                    </div>
                    <div style="font-size: 12px; margin-bottom: 4px;">
                        <span style="color: var(--text-muted)">OTP Box:</span> <code>${config.otpSelector}</code>
                    </div>
                    ${config.expiry ? `<div style="font-size: 12px;"><span style="color: var(--text-muted)">Expiry:</span> ${config.expiry}s</div>` : ''}
                `;

                // Style the codes in this cell
                tdSelectors.querySelectorAll('code').forEach(c => {
                    c.style.background = 'rgba(0,0,0,0.3)';
                    c.style.padding = '2px 4px';
                    c.style.borderRadius = '3px';
                });

                const tdActions = document.createElement('td');
                tdActions.className = 'actions';
                tdActions.style.alignItems = 'center';

                const toggleLabel = document.createElement('label');
                toggleLabel.className = 'compact-toggle';
                toggleLabel.title = config.enabled ? "Disable this rule" : "Enable this rule";
                const toggleInput = document.createElement('input');
                toggleInput.type = 'checkbox';
                toggleInput.checked = config.enabled;
                toggleInput.onchange = () => toggleOtpEntryEnable(domain, toggleInput.checked);
                const toggleSlider = document.createElement('span');
                toggleSlider.className = 'compact-slider';
                toggleLabel.appendChild(toggleInput);
                toggleLabel.appendChild(toggleSlider);

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.innerHTML = '✏️ Edit';
                editBtn.onclick = () => editOtpEntry(domain);

                const delBtn = document.createElement('button');
                delBtn.className = 'danger';
                delBtn.innerHTML = '🗑️ Delete';
                delBtn.onclick = () => deleteOtpEntry(domain);

                tdActions.appendChild(toggleLabel);
                tdActions.appendChild(editBtn);
                tdActions.appendChild(delBtn);

                tr.appendChild(tdDomain);
                tr.appendChild(tdSelectors);
                tr.appendChild(tdActions);

                otpConfigTbody.appendChild(tr);
            });
        }
    }

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = type;

        setTimeout(() => {
            statusMessage.style.display = 'none';
            statusMessage.className = '';
        }, 3000);
    }

    // Add or Update Entry
    saveBtn.addEventListener('click', () => {
        let domain = domainInput.value.trim().toLowerCase();
        const selector = selectorInput.value.trim();

        if (!domain || !selector) {
            showStatus('Please fill in both Domain and Selector!', 'error');
            return;
        }

        // Clean up domain if they pasted a full URL
        try {
            if (domain.startsWith('http')) {
                const url = new URL(domain);
                domain = url.hostname;
            }
        } catch (e) { }

        // Preserve enabled state if editing
        const isEnabled = (editingDomain && siteConfig[editingDomain]) ? siteConfig[editingDomain].enabled : true;

        if (editingDomain && editingDomain !== domain) {
            delete siteConfig[editingDomain];
        }

        siteConfig[domain] = { selector, enabled: isEnabled };

        saveConfig(() => {
            showStatus(`Successfully saved configuration for ${domain}`, 'success');

            // Reset form
            domainInput.value = '';
            selectorInput.value = '';
            saveBtn.textContent = 'Add Site';
            editingDomain = null;

            renderTable();
        });
    });

    // Edit Entry
    function editEntry(domain) {
        let config = siteConfig[domain];
        if (typeof config === 'string') config = { selector: config, enabled: true };

        domainInput.value = domain;
        selectorInput.value = config.selector;
        editingDomain = domain;
        saveBtn.textContent = 'Update Site';
        domainInput.focus();
    }

    function toggleEntryEnable(domain, isEnabled) {
        let config = siteConfig[domain];
        if (typeof config === 'string') config = { selector: config, enabled: isEnabled };
        else config.enabled = isEnabled;

        siteConfig[domain] = config;
        saveConfig(() => {
            renderTable();
        });
    }

    // Delete Entry
    function deleteEntry(domain) {
        if (confirm(`Are you sure you want to delete the configuration for ${domain}?`)) {
            delete siteConfig[domain];
            saveConfig(() => {
                showStatus(`Deleted configuration for ${domain}`, 'success');
                renderTable();

                if (editingDomain === domain) {
                    domainInput.value = '';
                    selectorInput.value = '';
                    saveBtn.textContent = 'Add Site';
                    editingDomain = null;
                }
            });
        }
    }

    // --- OTP Config Logic ---

    otpSaveBtn.addEventListener('click', () => {
        let domain = otpDomainInput.value.trim().toLowerCase();
        const emailSelector = otpEmailInput.value.trim();
        const triggerSelector = otpTriggerInput.value.trim();
        const otpSelector = otpBoxInput.value.trim();
        const expiry = parseInt(otpExpiryInput.value.trim(), 10);

        if (!domain || !emailSelector || !triggerSelector || !otpSelector) {
            showStatus('Please fill in Domain and all 3 Selectors for OTP Config!', 'error');
            return;
        }

        try {
            if (domain.startsWith('http')) {
                const url = new URL(domain);
                domain = url.hostname;
            }
        } catch (e) { }

        if (editingOtpDomain && editingOtpDomain !== domain) {
            delete otpSiteConfig[editingOtpDomain];
        }

        otpSiteConfig[domain] = {
            emailSelector,
            triggerSelector,
            otpSelector,
            expiry: isNaN(expiry) ? null : expiry
        };

        saveConfig(() => {
            showStatus(`Successfully saved OTP configuration for ${domain}`, 'success');

            otpDomainInput.value = '';
            otpEmailInput.value = '';
            otpTriggerInput.value = '';
            otpBoxInput.value = '';
            otpExpiryInput.value = '';
            otpSaveBtn.textContent = 'Add OTP Config';
            editingOtpDomain = null;

            renderOtpTable();
        });
    });

    function editOtpEntry(domain) {
        const config = otpSiteConfig[domain];
        otpDomainInput.value = domain;
        otpEmailInput.value = config.emailSelector;
        otpTriggerInput.value = config.triggerSelector;
        otpBoxInput.value = config.otpSelector;
        otpExpiryInput.value = config.expiry || '';

        editingOtpDomain = domain;
        otpSaveBtn.textContent = 'Update OTP Config';
        otpDomainInput.focus();
    }

    function toggleOtpEntryEnable(domain, isEnabled) {
        if (otpSiteConfig[domain]) {
            otpSiteConfig[domain].enabled = isEnabled;
            saveConfig(() => {
                renderOtpTable();
            });
        }
    }

    function deleteOtpEntry(domain) {
        if (confirm(`Are you sure you want to delete the OTP configuration for ${domain}?`)) {
            delete otpSiteConfig[domain];
            saveConfig(() => {
                showStatus(`Deleted OTP configuration for ${domain}`, 'success');
                renderOtpTable();

                if (editingOtpDomain === domain) {
                    otpDomainInput.value = '';
                    otpEmailInput.value = '';
                    otpTriggerInput.value = '';
                    otpBoxInput.value = '';
                    otpExpiryInput.value = '';
                    otpSaveBtn.textContent = 'Add OTP Config';
                    editingOtpDomain = null;
                }
            });
        }
    }

    // Init
    loadConfig();
});
