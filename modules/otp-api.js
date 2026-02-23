/**
 * DakBox OTP API Module
 * Standalone OTP fetching utilities for use in content scripts
 * Communicates with background service worker for API calls
 */

const DakBoxOTP = {
    /**
     * Fetch login OTP via background service worker
     * @param {string} username - The dakbox.net username (part before @dakbox.net)
     * @param {number} maxRetries - Maximum retry attempts (default: 5)
     * @returns {Promise<Object>} - { success, otp, subject, from, remaining_seconds, expired, error }
     */
    async fetchLoginOtp(username, maxRetries = 5) {
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
    },

    /**
     * Fetch registration OTP via background service worker
     * @param {string} username - The dakbox.net username
     * @param {number} maxRetries - Maximum retry attempts (default: 5)
     * @returns {Promise<Object>} - { success, otp, subject, from, remaining_seconds, expired, error }
     */
    async fetchRegistrationOtp(username, maxRetries = 5) {
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
    },

    /**
     * Extract username from a dakbox.net email
     * @param {string} email - Full email address (e.g., user@dakbox.net)
     * @returns {string|null} - Username or null if invalid
     */
    extractUsername(email) {
        const match = email.match(/^([^@]+)@dakbox\.net$/i);
        return match ? match[1] : null;
    },

    /**
     * Open dakbox inbox in a new tab
     * @param {string} username - The dakbox.net username
     */
    openInbox(username) {
        chrome.runtime.sendMessage({ action: 'openDakboxTab', username });
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.DakBoxOTP = DakBoxOTP;
}
