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

    // Load existing config
    function loadConfig() {
        chrome.storage.local.get(['dakboxSiteConfig'], (data) => {
            siteConfig = data.dakboxSiteConfig || {};
            renderTable();
        });
    }

    // Save config back to storage
    function saveConfig(callback) {
        chrome.storage.local.set({ dakboxSiteConfig: siteConfig }, () => {
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
                const tr = document.createElement('tr');

                const tdDomain = document.createElement('td');
                tdDomain.textContent = domain;

                const tdSelector = document.createElement('td');
                const code = document.createElement('code');
                code.style.background = 'rgba(0,0,0,0.3)';
                code.style.padding = '4px 6px';
                code.style.borderRadius = '4px';
                code.textContent = siteConfig[domain];
                tdSelector.appendChild(code);

                const tdActions = document.createElement('td');
                tdActions.className = 'actions';

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.innerHTML = '✏️ Edit';
                editBtn.onclick = () => editEntry(domain);

                const delBtn = document.createElement('button');
                delBtn.className = 'danger';
                delBtn.innerHTML = '🗑️ Delete';
                delBtn.onclick = () => deleteEntry(domain);

                tdActions.appendChild(editBtn);
                tdActions.appendChild(delBtn);

                tr.appendChild(tdDomain);
                tr.appendChild(tdSelector);
                tr.appendChild(tdActions);

                configTbody.appendChild(tr);
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

        // If editing a different domain name, remove the old one
        if (editingDomain && editingDomain !== domain) {
            delete siteConfig[editingDomain];
        }

        siteConfig[domain] = selector;

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
        domainInput.value = domain;
        selectorInput.value = siteConfig[domain];
        editingDomain = domain;
        saveBtn.textContent = 'Update Site';
        domainInput.focus();
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

    // Init
    loadConfig();
});
