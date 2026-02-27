# DakBox - Temporary Email & OTP Helper

![Version](https://img.shields.io/github/package-json/v/techtwice/dakbox-extension?filename=manifest.json)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/mlfdegmnkajihcbbgcjghokjhofgepeo.svg)](https://chromewebstore.google.com/detail/dakbox-temporary-email-ot/mlfdegmnkajihcbbgcjghokjhofgepeo)

Enhance your DakBox.net temporary email experience with automatic OTP (One-Time Password) extraction, quick inbox access, and seamless verification code auto-fill. This extension bridges your temporary inbox directly to your active tabs, saving you time and effort.

## ✨ Features

- 🎲 **Auto Random Email Generation:** Quickly generate and fill temporary email addresses into any form field.
- 📬 **Quick Inbox Access:** Easily access your DakBox.net temporary email directly from the extension popup.
- ⚡ **Auto OTP Extraction:** Automatically detect and extract One-Time Passwords from incoming emails.
- 🎯 **Visual Element Picker:** Easily configure custom CSS selectors for any site using a built-in visual point-and-click tool.
- ⚙️ **Custom Site Configurations:** Define specific rules for any website, including custom OTP fields and auto-submit behavior.
- 🤖 **Auto-Fill Functionality:** Automatically fill verification codes on supported platforms.
- 🔒 **Privacy Focused:** Operates locally in your browser to maintain your privacy while using temporary emails.

## 🚀 Installation

### From Chrome Web Store (Recommended)

You can easily install the DakBox extension directly from the Chrome Web Store:

* [**Download DakBox from the Chrome Web Store**](https://chromewebstore.google.com/detail/dakbox-temporary-email-ot/mlfdegmnkajihcbbgcjghokjhofgepeo)

### Developer Mode (Local Installation)

To try out this extension locally or contribute to its development:

1. Clone or download this repository to your local machine.
2. Open your chromium-based browser and navigate to the Extensions page (`chrome://extensions/` or `edge://extensions/`).
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click on the **Load unpacked** button.
5. Select the `dakbox-extension` directory.
6. The extension is now installed and ready to use! Pin it to your toolbar for quick access.

## 🛠️ Usage

1. Click the DakBox icon in your browser toolbar to open the popup.
2. The extension will automatically interface with your active DakBox.net session.
3. When you receive an OTP in your temporary inbox, the extension will detect it.
4. On supported websites, the OTP will be securely and automatically filled into the appropriate verification fields.

## 🧩 Supported Platforms for Auto-fill

Current out-of-the-box support for automatic OTP filling includes:
- `svp-international.pacc.sa`

**Any Custom Website!** 
You can now use the Options menu (`Right-click Extension > Options`) to visually map OTP fields for *any* custom site, giving you full control over where and how verification codes are handled.

## 📄 Manifest V3

This extension is built using the latest **Manifest V3** standards, ensuring better performance, privacy, and security.

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements, or want to add support for auto-filling on more websites, feel free to open an issue or submit a pull request.

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.
