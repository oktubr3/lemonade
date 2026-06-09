# Changelog

All notable changes to Lemonade Password Manager (Firefox Extension) will be documented in this file.

## [1.1.1] - 2026-05-02

### Changed
- Reduced host permissions to only the Firebase and Lemonade API domains required by the extension.

## [1.0.1] - 2025-02-03

### Changed
- Renamed extension from "Lemonade Password Manager - Autofill" to "Lemonade Password Manager"

### Removed
- Removed unused `scripting` permission

## [1.0.0] - 2025-01-16

### Added
- Initial release
- Google OAuth authentication via Firebase
- Password vault access with AES-256 decryption
- Autofill credentials on login forms
- Domain-based credential matching
- Secure credential display in popup
- Dark/light theme support
- Firefox-specific implementation using browser.* APIs
