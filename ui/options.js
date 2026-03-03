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
    const otpSubmitInput = document.getElementById('otp-submit-input');
    const otpExpiryInput = document.getElementById('otp-expiry-input');
    const otpSaveBtn = document.getElementById('otp-save-btn');
    const otpConfigTbody = document.getElementById('otp-config-tbody');
    const otpEmptyState = document.getElementById('otp-empty-state');

    // ── OTP API ──
    const OTP_API_URL = 'https://dakbox.net/api/otp/site-configs';

    async function getAuthToken() {
        return new Promise(resolve => {
            chrome.storage.local.get(['dakboxApiToken'], data => resolve(data.dakboxApiToken || ''));
        });
    }

    // User OTP configs (type === 'user') — server-backed array
    let userOtpConfigs  = [];
    let editingOtpId    = null; // server record ID when editing

    // Admin OTP configs (type === 'admin') — read-only from server
    let adminOtpConfigs      = [];
    const ADMIN_STATES_KEY   = 'dakboxAdminOtpStates';
    let adminOtpToggleStates = {};

    // Load email-generator site config (local only)
    function loadConfig() {
        chrome.storage.local.get(['dakboxSiteConfig'], (data) => {
            siteConfig = data.dakboxSiteConfig || {};
            renderTable();
        });
    }

    // Save email-generator site config (local only)
    function saveConfig(callback) {
        chrome.storage.local.set({ dakboxSiteConfig: siteConfig }, () => {
            if (callback) callback();
        });
    }

    // --- Element Picker Logic ---
    document.querySelectorAll('.pick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            chrome.runtime.sendMessage({ action: 'armDakboxPicker', target: targetId }, (response) => {
                if (response && response.success) {
                    showStatus(response.message, 'success', 6000);
                } else {
                    showStatus('Error: ' + (response?.error || 'Could not start picker'), 'error', 4000);
                }
            });
        });
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'dakboxPickerResultToOptions') {
            if (request.selector) {
                const inputEl = document.getElementById(request.target);
                if (inputEl) {
                    inputEl.value = request.selector;
                    inputEl.focus();
                    showStatus('Element selector picked successfully!', 'success');
                }
            } else if (request.cancelled) {
                showStatus('Element picking cancelled.', 'error', 2000);
            }
        }
    });

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

    // Render the User OTP table (server-backed array)
    function renderOtpTable() {
        otpConfigTbody.innerHTML = '';

        if (userOtpConfigs.length === 0) {
            otpEmptyState.style.display = 'block';
            document.getElementById('otp-config-table').style.display = 'none';
        } else {
            otpEmptyState.style.display = 'none';
            document.getElementById('otp-config-table').style.display = 'table';

            userOtpConfigs.forEach(config => {
                const isEnabled = config.is_active;
                const tr = document.createElement('tr');
                if (!isEnabled) tr.style.opacity = '0.5';

                const tdDomain = document.createElement('td');
                tdDomain.textContent = config.website_domain;

                const tdSelectors = document.createElement('td');
                const selectorRows = [
                    { label: 'Email',      value: config.email_selector },
                    { label: 'Trigger',    value: config.trigger_selector },
                    { label: 'OTP Box',    value: config.otp_box_selector },
                    { label: 'OTP Submit', value: config.otp_submit_selector },
                    { label: 'Expiry',     value: config.expiry_seconds ? `${config.expiry_seconds}s` : null }
                ].filter(r => r.value);

                tdSelectors.innerHTML = selectorRows.map(r =>
                    `<div style="font-size:12px;margin-bottom:4px;">` +
                    `<span style="color:var(--text-muted)">${r.label}:</span> ` +
                    `<code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">${r.value}</code>` +
                    `</div>`
                ).join('');

                const tdActions = document.createElement('td');
                tdActions.className = 'actions';
                tdActions.style.alignItems = 'center';

                const toggleLabel = document.createElement('label');
                toggleLabel.className = 'compact-toggle';
                toggleLabel.title = isEnabled ? 'Disable this rule' : 'Enable this rule';
                const toggleInput = document.createElement('input');
                toggleInput.type = 'checkbox';
                toggleInput.checked = isEnabled;
                toggleInput.onchange = () => toggleOtpEntryEnable(config.id, toggleInput.checked, tr, toggleLabel);
                const toggleSlider = document.createElement('span');
                toggleSlider.className = 'compact-slider';
                toggleLabel.appendChild(toggleInput);
                toggleLabel.appendChild(toggleSlider);

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.innerHTML = '✏️ Edit';
                editBtn.onclick = () => editOtpEntry(config);

                const delBtn = document.createElement('button');
                delBtn.className = 'danger';
                delBtn.innerHTML = '🗑️ Delete';
                delBtn.onclick = () => deleteOtpEntry(config.id, config.website_domain);

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

    function showStatus(message, type, timeout = 3000) {
        statusMessage.textContent = message;
        statusMessage.className = type;

        // Use a generic placeholder if we're dealing with the OTP form so it shows up in both places
        // or just use the main one. Since they are stacked, main one is usually fine.
        const otpStatusMessage = document.getElementById('otp-status-message');
        if (otpStatusMessage) {
            otpStatusMessage.textContent = message;
            otpStatusMessage.className = type;
        }

        setTimeout(() => {
            statusMessage.style.display = 'none';
            statusMessage.className = '';
            if (otpStatusMessage) {
                otpStatusMessage.style.display = 'none';
                otpStatusMessage.className = '';
            }
        }, timeout);
    }

    // Add or Update Entry
    saveBtn.addEventListener('click', () => {
        let domain = domainInput.value.trim().toLowerCase();
        const selector = selectorInput.value.trim();

        if (!validateRequired([domainInput, selectorInput])) {
            showStatus('Please fill in all mandatory fields!', 'error');
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

    // ── Helper: status message for OTP section ──
    function showOtpStatus(message, type, timeout = 3500) {
        const el = document.getElementById('otp-status-message');
        if (!el) return;
        el.textContent = message;
        el.className = type;
        clearTimeout(el._timer);
        el._timer = setTimeout(() => { el.style.display = 'none'; el.className = ''; }, timeout);
    }

    // ── Helper: reset the OTP form ──
    function resetOtpForm() {
        otpDomainInput.value   = '';
        otpEmailInput.value    = '';
        otpTriggerInput.value  = '';
        otpBoxInput.value      = '';
        otpSubmitInput.value   = '';
        otpExpiryInput.value   = '';
        otpSaveBtn.textContent = 'Add OTP Config';
        editingOtpId = null;
    }

    // --- OTP Config Logic (server-backed) ---

    otpSaveBtn.addEventListener('click', async () => {
        let domain = otpDomainInput.value.trim().toLowerCase();
        const emailSelector    = otpEmailInput.value.trim();
        const triggerSelector  = otpTriggerInput.value.trim();
        const otpSelector      = otpBoxInput.value.trim();
        const otpSubmitSelector = otpSubmitInput.value.trim();
        const expiry           = parseInt(otpExpiryInput.value.trim(), 10);

        if (!validateRequired([otpDomainInput, otpEmailInput, otpTriggerInput, otpBoxInput])) {
            showOtpStatus('Please fill in all mandatory fields!', 'error');
            return;
        }

        try {
            if (domain.startsWith('http')) {
                const url = new URL(domain);
                domain = url.hostname;
            }
        } catch (e) { }

        const payload = {
            website_domain:      domain,
            email_selector:      emailSelector,
            trigger_selector:    triggerSelector,
            otp_box_selector:    otpSelector,
            otp_submit_selector: otpSubmitSelector || undefined,
            expiry_seconds:      isNaN(expiry) ? undefined : expiry,
            is_active:           true
        };
        // Strip undefined keys
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        otpSaveBtn.disabled       = true;
        otpSaveBtn.textContent    = editingOtpId ? 'Updating…' : 'Adding…';

        try {
            const token   = await getAuthToken();
            const url     = editingOtpId ? `${OTP_API_URL}/${editingOtpId}/update` : OTP_API_URL;
            const method  = 'POST';

            const res     = await fetch(url, {
                method,
                redirect: 'follow',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result  = await res.json();

            if (res.ok || result.success) {
                showOtpStatus(
                    editingOtpId
                        ? `Updated OTP config for ${domain}`
                        : `Added OTP config for ${domain}`,
                    'success'
                );
                resetOtpForm();
                loadAllOtpConfigs();
            } else if (res.status === 403) {
                showOtpStatus(
                    editingOtpId
                        ? 'You do not have permission to edit this config. Only the owner can modify it.'
                        : 'You do not have permission to create OTP configs. Please check your API token.',
                    'error'
                );
            } else if (res.status === 401) {
                showOtpStatus('Your session has expired. Please re-enter your API token in the popup.', 'error');
            } else {
                showOtpStatus(result.message || `Server error (${res.status}). Please try again.`, 'error');
            }
        } catch (err) {
            console.error('DakBox OTP save error:', err);
            showOtpStatus('Network error. Could not save config.', 'error');
        } finally {
            otpSaveBtn.disabled    = false;
            otpSaveBtn.textContent = editingOtpId ? 'Update OTP Config' : 'Add OTP Config';
        }
    });

    function editOtpEntry(config) {
        otpDomainInput.value   = config.website_domain;
        otpEmailInput.value    = config.email_selector   || '';
        otpTriggerInput.value  = config.trigger_selector || '';
        otpBoxInput.value      = config.otp_box_selector || '';
        otpSubmitInput.value   = config.otp_submit_selector || '';
        otpExpiryInput.value   = config.expiry_seconds   || '';
        editingOtpId           = config.id;
        otpSaveBtn.textContent = 'Update OTP Config';
        otpDomainInput.focus();
        otpDomainInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function toggleOtpEntryEnable(id, isEnabled, rowEl, labelEl) {
        try {
            const token = await getAuthToken();
            const res   = await fetch(`${OTP_API_URL}/${id}/update`, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isEnabled })
            });
            if (res.status === 403) {
                showOtpStatus('You do not have permission to modify this config.', 'error');
                return;
            }
            if (res.status === 401) {
                showOtpStatus('Your session has expired. Please re-enter your API token in the popup.', 'error');
                return;
            }
            if (!res.ok) throw new Error();
            rowEl.style.opacity = isEnabled ? '1' : '0.5';
            labelEl.title       = isEnabled ? 'Disable this rule' : 'Enable this rule';
            const cfg = userOtpConfigs.find(c => c.id === id);
            if (cfg) {
                cfg.is_active = isEnabled;
                syncConfigsToContentScript();
            }
        } catch (e) {
            showOtpStatus('Failed to update status. Please try again.', 'error');
        }
    }

    async function deleteOtpEntry(id, domain) {
        if (!confirm(`Are you sure you want to delete the OTP configuration for ${domain}?`)) return;
        try {
            const token = await getAuthToken();
            const res   = await fetch(`${OTP_API_URL}/${id}/delete`, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            if (res.status === 403) {
                showOtpStatus('You do not have permission to delete this config.', 'error');
                return;
            }
            if (res.status === 401) {
                showOtpStatus('Your session has expired. Please re-enter your API token in the popup.', 'error');
                return;
            }
            if (!res.ok) throw new Error();
            showOtpStatus(`Deleted OTP config for ${domain}`, 'success');
            if (editingOtpId === id) resetOtpForm();
            loadAllOtpConfigs();
        } catch (e) {
            showOtpStatus('Failed to delete config. Please try again.', 'error');
        }
    }

    // Helper to highlight empty required fields
    function validateRequired(inputs) {
        let firstEmpty = null;
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.classList.add('input-error');
                isValid = false;
                if (!firstEmpty) firstEmpty = input;
            } else {
                input.classList.remove('input-error');
            }
        });

        if (firstEmpty) firstEmpty.focus();
        return isValid;
    }

    // Clear error class on input
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            if (input.value.trim()) {
                input.classList.remove('input-error');
            }
        });
    });

    // ═══ UNIFIED OTP CONFIG LOADER ═══
    // Single GET → splits into user (editable) and admin (read-only) arrays

    const defaultLoadingEl  = document.getElementById('default-otp-loading');
    const defaultErrorEl    = document.getElementById('default-otp-error');
    const defaultTableEl    = document.getElementById('default-otp-config-table');
    const defaultTbodyEl    = document.getElementById('default-otp-config-tbody');
    const defaultEmptyEl    = document.getElementById('default-otp-empty-state');
    const defaultRetryBtn   = document.getElementById('default-otp-retry-btn');

    const otpServerLoadingEl = document.getElementById('otp-server-loading');
    const otpServerErrorEl   = document.getElementById('otp-server-error');
    const otpServerRetryBtn  = document.getElementById('otp-server-retry-btn');

    async function loadAllOtpConfigs() {
        // Show loading in user OTP section
        if (otpServerLoadingEl) otpServerLoadingEl.style.display = 'flex';
        if (otpServerErrorEl)   otpServerErrorEl.style.display   = 'none';
        document.getElementById('otp-config-table').style.display = 'none';
        if (otpEmptyState)      otpEmptyState.style.display       = 'none';

        // Show loading in admin OTP section
        if (defaultLoadingEl) defaultLoadingEl.style.display = 'flex';
        if (defaultErrorEl)   defaultErrorEl.style.display   = 'none';
        if (defaultTableEl)   defaultTableEl.style.display   = 'none';
        if (defaultEmptyEl)   defaultEmptyEl.style.display   = 'none';

        let allConfigs = [];
        try {
            const token    = await getAuthToken();
            const response = await fetch(OTP_API_URL, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error('API returned success: false');
            allConfigs = result.data || [];
        } catch (err) {
            console.error('DakBox: failed to load OTP configs', err);
            if (otpServerLoadingEl) otpServerLoadingEl.style.display = 'none';
            if (otpServerErrorEl)   otpServerErrorEl.style.display   = 'flex';
            if (defaultLoadingEl)   defaultLoadingEl.style.display   = 'none';
            if (defaultErrorEl)     defaultErrorEl.style.display     = 'flex';
            return;
        }

        userOtpConfigs  = allConfigs.filter(c => c.type === 'user');
        adminOtpConfigs = allConfigs.filter(c => c.type === 'admin');

        chrome.storage.local.get([ADMIN_STATES_KEY], (data) => {
            adminOtpToggleStates = data[ADMIN_STATES_KEY] || {};

            // For each admin config:
            //  • First encounter → seed from server (store enabled + updatedAt)
            //  • Server updatedAt is newer than stored → server update wins,
            //    reset enabled to server's is_active and store new updatedAt
            //  • updatedAt unchanged → keep the user's own toggle preference
            let changed = false;
            adminOtpConfigs.forEach(config => {
                const domain        = config.website_domain;
                const serverTime    = config.updated_at || '';
                const stored        = adminOtpToggleStates[domain];

                if (stored === undefined) {
                    // First time seeing this config
                    adminOtpToggleStates[domain] = { enabled: config.is_active === true, updatedAt: serverTime };
                    changed = true;
                } else if (serverTime && serverTime !== stored.updatedAt) {
                    // Admin updated the config — server wins, reset preference
                    adminOtpToggleStates[domain] = { enabled: config.is_active === true, updatedAt: serverTime };
                    changed = true;
                }
                // else: same updatedAt → keep user's local toggle as-is
            });
            if (changed) {
                chrome.storage.local.set({ [ADMIN_STATES_KEY]: adminOtpToggleStates });
            }

            if (otpServerLoadingEl) otpServerLoadingEl.style.display = 'none';
            if (defaultLoadingEl)   defaultLoadingEl.style.display   = 'none';

            // Rebuild the local cache that generic-otp-content.js reads on every page load.
            // Maps server snake_case → camelCase and merges user + enabled admin configs.
            syncConfigsToContentScript();

            renderOtpTable();
            renderDefaultOtpTable();
        });
    }

    // ── Sync server configs → chrome.storage.local for content script ──
    // generic-otp-content.js reads dakboxOtpSiteConfig[hostname] on every page load.
    // It expects camelCase keys and an 'enabled' boolean.
    // Admin configs use the user's local toggle state; user configs use is_active.
    // User-type configs ALWAYS take precedence over admin configs for the same domain.
    function syncConfigsToContentScript() {
        const map = {};
        const overriddenDomains = [];

        // 1. Seed admin configs that are enabled by user's local preference
        adminOtpConfigs.forEach(config => {
            const domain    = config.website_domain;
            const isEnabled = adminOtpToggleStates[domain]?.enabled ?? config.is_active;
            map[domain] = {
                emailSelector:     config.email_selector,
                triggerSelector:   config.trigger_selector,
                otpSelector:       config.otp_box_selector,
                otpSubmitSelector: config.otp_submit_selector || undefined,
                expiry:            config.expiry_seconds      || undefined,
                enabled:           isEnabled
            };
        });

        // 2. User configs ALWAYS override admin configs for the same domain
        userOtpConfigs.forEach(config => {
            const domain = config.website_domain;
            if (map[domain]) {
                overriddenDomains.push(domain);
            }
            map[domain] = {
                emailSelector:     config.email_selector,
                triggerSelector:   config.trigger_selector,
                otpSelector:       config.otp_box_selector,
                otpSubmitSelector: config.otp_submit_selector || undefined,
                expiry:            config.expiry_seconds      || undefined,
                enabled:           config.is_active === true
            };
        });

        chrome.storage.local.set({ dakboxOtpSiteConfig: map }, () => {
            let msg = `[DakBox] Synced ${Object.keys(map).length} OTP config(s)`;
            if (overriddenDomains.length > 0) {
                msg += ` (user config overriding admin for: ${overriddenDomains.join(', ')})`;
            }
            console.log(msg);
        });
    }

    // ── Admin (read-only) OTP table ──
    function renderDefaultOtpTable() {
        defaultTbodyEl.innerHTML = '';

        if (adminOtpConfigs.length === 0) {
            defaultEmptyEl.style.display = 'block';
            return;
        }

        defaultTableEl.style.display = 'table';

        adminOtpConfigs.forEach(config => {
            const domain    = config.website_domain;
            // Always use the user's saved preference (seeded on first load from is_active).
            // Server changes to is_active never override the user's local setting.
            const isEnabled = adminOtpToggleStates[domain]?.enabled ?? config.is_active;

            const tr = document.createElement('tr');
            if (!isEnabled) tr.style.opacity = '0.5';

            const tdDomain = document.createElement('td');
            tdDomain.innerHTML = `
                <div style="font-weight:500;">${domain}</div>
                <div style="margin-top:5px;"><span class="locked-badge">🔒 Read-only</span></div>
            `;

            const tdSelectors = document.createElement('td');
            const selectorRows = [
                { label: 'Email',      value: config.email_selector },
                { label: 'Trigger',    value: config.trigger_selector },
                { label: 'OTP Box',    value: config.otp_box_selector },
                { label: 'OTP Submit', value: config.otp_submit_selector },
                { label: 'Expiry',     value: config.expiry_seconds ? `${config.expiry_seconds}s` : null }
            ].filter(r => r.value);

            tdSelectors.innerHTML = selectorRows.map(r =>
                `<div style="font-size:12px;margin-bottom:4px;">` +
                `<span style="color:var(--text-muted)">${r.label}:</span> ` +
                `<code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:3px;">${r.value}</code>` +
                `</div>`
            ).join('');

            const tdActions = document.createElement('td');
            tdActions.className = 'actions';
            tdActions.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;';

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'compact-toggle';
            toggleLabel.title = isEnabled ? 'Disable this config' : 'Enable this config';

            const toggleInput = document.createElement('input');
            toggleInput.type     = 'checkbox';
            toggleInput.checked  = isEnabled;
            toggleInput.onchange = () => toggleDefaultOtpConfig(domain, toggleInput.checked, tr, toggleLabel);

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'compact-slider';
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);

            const reportBtn = document.createElement('a');
            reportBtn.className = 'report-btn';
            reportBtn.href      = buildReportMailto(domain, config);
            reportBtn.title     = 'Report an issue with this config to the DakBox team';
            reportBtn.innerHTML = '⚠️ Report Issue';

            tdActions.appendChild(toggleLabel);
            tdActions.appendChild(reportBtn);

            tr.appendChild(tdDomain);
            tr.appendChild(tdSelectors);
            tr.appendChild(tdActions);

            defaultTbodyEl.appendChild(tr);
        });
    }

    function toggleDefaultOtpConfig(domain, isEnabled, rowEl, labelEl) {
        // Preserve the stored updatedAt so the next load doesn't mistake this
        // user toggle as a server update that needs to be re-applied.
        const existingUpdatedAt = adminOtpToggleStates[domain]?.updatedAt || '';
        adminOtpToggleStates[domain] = { enabled: isEnabled, updatedAt: existingUpdatedAt };
        chrome.storage.local.set({ [ADMIN_STATES_KEY]: adminOtpToggleStates }, () => {
            rowEl.style.opacity = isEnabled ? '1' : '0.5';
            labelEl.title       = isEnabled ? 'Disable this config' : 'Enable this config';
            syncConfigsToContentScript();
        });
    }

    function buildReportMailto(domain, config) {
        const subject = encodeURIComponent(`[DakBox] OTP Config Issue: ${domain}`);
        const body    = encodeURIComponent(
            `Hello DakBox Team,\n\n` +
            `I am experiencing an issue with the default OTP configuration for: ${domain}\n\n` +
            `Current config details:\n` +
            `  Email Selector:      ${config.email_selector}\n` +
            `  Trigger Selector:    ${config.trigger_selector}\n` +
            `  OTP Box Selector:    ${config.otp_box_selector}\n` +
            `  OTP Submit Selector: ${config.otp_submit_selector || 'N/A'}\n` +
            `  Expiry:              ${config.expiry_seconds ? config.expiry_seconds + 's' : 'N/A'}\n\n` +
            `Issue description:\n[Please describe what is not working]\n\n` +
            `Regards`
        );
        return `mailto:techtwice@gmail.com?subject=${subject}&body=${body}`;
    }

    // Retry buttons (both sections share the same load function)
    if (defaultRetryBtn)   defaultRetryBtn.addEventListener('click', loadAllOtpConfigs);
    if (otpServerRetryBtn) otpServerRetryBtn.addEventListener('click', loadAllOtpConfigs);

    // Init
    loadConfig();
    loadAllOtpConfigs();
});

