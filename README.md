# DakBox - Temporary Email & OTP Helper

![Version](https://img.shields.io/github/package-json/v/techtwice/dakbox-extension?filename=manifest.json)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/mlfdegmnkajihcbbgcjghokjhofgepeo.svg)](https://chromewebstore.google.com/detail/dakbox-temporary-email-ot/mlfdegmnkajihcbbgcjghokjhofgepeo)

Enhance your DakBox.net temporary email experience with automatic OTP (One-Time Password) extraction, quick inbox access, and seamless verification code auto-fill. This extension bridges your temporary inbox directly to your active tabs, saving you time and effort.

## ✨ Features

- 🎲 **Auto Random Email Generation:** Instantly generate and fill temporary DakBox email addresses into any form field on any website.
- 📬 **Quick Inbox Access:** Open your DakBox.net inbox directly from the extension popup.
- ⚡ **Auto OTP Extraction:** Automatically detect and extract One-Time Passwords from incoming emails with in-flight deduplication and 429/rate-limit handling.
- 🎯 **Visual Element Picker:** Configure custom CSS selectors for any site using a built-in point-and-click tool directly from the Options page.
- ⚙️ **OTP Site Configs:** Manage server-backed OTP site configurations (user-defined and admin defaults) — accessible via the popup's **OTP Site Configs** button.
- 🤖 **Auto-Fill & Auto-Submit:** Automatically fill and optionally submit verification codes on supported platforms.
- 📮 **Yopmail Support:** Auto-open Yopmail inboxes in addition to DakBox inboxes during OTP detection.
- 📊 **Auto-Open Plan Limits:** Track and display monthly auto-open usage (used / limit) driven by the DakBox server API. Free plan limited to 50/month; premium users get unlimited.
- 🔒 **Security Hardened:** URL allowlisting for tab opens, storage key whitelisting for settings saves, all console output disabled in production.
- 🔑 **API Token Authentication:** Connect your DakBox account via API token to unlock OTP fetching, plan details, and auto-open tracking.

## 🚀 Installation

### From Chrome Web Store (Recommended)

* [**Download DakBox from the Chrome Web Store**](https://chromewebstore.google.com/detail/dakbox-temporary-email-ot/mlfdegmnkajihcbbgcjghokjhofgepeo)

### Developer Mode (Local Installation)

1. Clone or download this repository to your local machine.
2. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** using the toggle in the top right.
4. Click **Load unpacked** and select the `dakbox-extension` directory.
5. Pin the extension to your toolbar for quick access.

## 🛠️ Usage

1. Click the DakBox icon in your toolbar to open the popup.
2. **Connect your account:** Paste your DakBox API token and click **Connect**. This unlocks OTP fetching and auto-open tracking.
3. Enter your DakBox username to use as your temporary email inbox.
4. When you fill a DakBox email on a website and trigger a login or registration, the extension automatically:
   - Opens your inbox tab (if Auto Open is enabled)
   - Fetches the OTP from the DakBox API
   - Fills it into the verification field
5. Use the **OTP Site Configs** button to manage which sites have custom OTP selectors.

## ⚙️ Settings (Popup Toggles)

| Toggle | Default | Description |
|---|---|---|
| Auto OTP Fill on SVP | ON | Auto-fill OTP codes on svp-international.pacc.sa |
| Auto Open DakBox Inbox | OFF | Auto-open your DakBox inbox tab when needed |
| Auto Open Yopmail | ON | Auto-open Yopmail inbox tab when a Yopmail address is detected |
| Auto Random Email Generate | ON | Show the email generator button on all website email fields |

## 🧩 Supported Platforms

- **`svp-international.pacc.sa`** — Full auto-fill (login OTP + registration OTP) with Yopmail/DakBox inbox auto-open.
- **Any Custom Website** — Configure via Options → OTP Site Configs using the visual element picker.

## 📡 API Integration

The extension communicates exclusively with `https://dakbox.net` over HTTPS:

| Endpoint | Purpose |
|---|---|
| `GET /api/user` | Verify token, fetch plan details and auto-open usage |
| `GET /api/otp/get` | Fetch login OTP for a given email username |
| `GET /api/otp/verification` | Fetch registration OTP for a given email username |
| `POST /api/auto-opens/track` | Track each auto-open event against your plan limit |
| `GET /api/otp/site-configs` | Load server-backed OTP site configurations |

## 📄 Manifest V3

Built on **Manifest V3** — service worker based background script, no persistent background pages, CSP-compliant with no inline scripts.

## 🔐 Privacy & Security

- All user preferences and the API token are stored locally via `chrome.storage.local`.
- No browsing history, page content, or third-party data is ever collected or transmitted.
- See the full [Extension Privacy Policy](https://dakbox.net/page/extension-privacy).

## 🤝 Contributing

Contributions are welcome! Open an issue or submit a pull request for bug fixes, new site support, or feature suggestions.

## 📜 License

This project is licensed under the MIT License — see the LICENSE file for details.
