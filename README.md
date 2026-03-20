# Visibility Spoofer

A powerful Chrome extension that spoofs the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) and user interaction events, making webpages believe they are always visible, focused, and free from monitoring.

---

## Features

### Core Spoofing
- **Spoofs `document.visibilityState`** → always returns `"visible"`
- **Spoofs `document.hidden`** → always returns `false`
- **Overrides `document.hasFocus()`** → always returns `true`
- **Blocks visibility-related events** (`visibilitychange`, `blur`, `focus`, `pagehide`, etc.)
- **Neutralises `on*` handler properties** (`onblur`, `onfocus`, `onvisibilitychange`, etc.)

### User Interaction Spoofing (NEW)
- **Blocks copy, cut, paste events** → prevents clipboard monitoring
- **Blocks drag & drop events** → prevents drag detection
- **Blocks contextmenu events** → prevents right-click detection
- **Blocks keyboard events** → prevents shortcut detection

### Advanced Protection
- **Anti-detection engine** — overridden functions pass all common detection vectors:
  - `fn.toString()` returns `"function name() { [native code] }"`
  - `Object.getOwnPropertyDescriptor()` returns original-shaped descriptors
  - `Reflect.getOwnPropertyDescriptor()` also spoofed
  - Correct `.name` and `.length` on all patched functions
- **Dynamic iframe protection** — newly created iframes are spoofed automatically via `MutationObserver`
- **Runs in `MAIN` world** — no `chrome-extension://` URLs appear in stack traces
- **Zero console output** — leaves no traces in DevTools

### UI & Management (NEW)
- **User-friendly popup interface** — toggle spoofing per site with one click
- **Whitelist & Blacklist** — manage which sites get spoofed
- **Per-site control** — enable/disable spoofing for individual websites
- **Persistent settings** — your preferences are saved automatically
- **Visual status indicators** — see at a glance if spoofing is active

---

## Installation

### From source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/yyyutakaaa/Visibility-Spoofer.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the cloned folder
5. The extension is now active on all tabs

---

## Usage

### Quick Start

1. **Click the extension icon** in your Chrome toolbar to open the popup
2. **Toggle spoofing** for the current site using the switch
3. **Manage lists** by clicking "Beheer lijsten" to access the full settings page

### Popup Interface

The popup shows:
- **Current site** — the hostname you're currently visiting
- **Toggle switch** — enable/disable spoofing for this site
- **Status indicator** — green = active, red = inactive
- **List management buttons** — quickly add sites to whitelist or blacklist
- **Spoofed actions list** — see what's being blocked

### Settings Page

Access via "Beheer lijsten" button in the popup:
- **Global toggle** — enable/disable spoofing for all sites
- **Whitelist** — sites where spoofing is always active
- **Blacklist** — sites where spoofing is never active
- **Add/remove sites** — manage your lists

### Priority System

The extension uses the following priority order:
1. **Blacklist** (highest) — sites in blacklist are never spoofed
2. **Whitelist** — sites in whitelist are always spoofed
3. **Per-site settings** — individual toggle settings from popup
4. **Global setting** (lowest) — default for all sites

---

## How It Works

### Architecture

The extension uses a clean, efficient architecture:

1. **Background Service Worker** (`background.js`) — manages settings, storage, and communication
2. **Main Spoof Script** (`spoof.js`) — runs in MAIN world at document_start, performs all spoofing
3. **Popup UI** (`popup.html/js/css`) — user interface for per-site control
4. **Options Page** (`options.html/js`) — full settings management

### Spoofing Process

The spoof script works in 11 phases:

| Phase | Description |
|-------|-------------|
| 0 | Native reference vault — saves original functions before anything is modified |
| 1 | Anti-detection engine — patches `Function.prototype.toString` via a WeakMap |
| 2 | Property descriptor spoofing — patches `Object/Reflect.getOwnPropertyDescriptor` |
| 3 | Visibility API spoofing — overrides `visibilityState`, `hidden`, and vendor-prefixed variants |
| 4 | Event handler property spoofing — neutralises `onblur`, `onfocus`, `onvisibilitychange`, etc. |
| 5 | Event listener interception — blocks visibility detection and interaction monitoring (includes `body`/`documentElement` targets) |
| 6 | `document.hasFocus()` override — always returns `true` |
| 6.1 | `navigator.userActivation` spoofing — `isActive` and `hasBeenActive` always return `true` |
| 6.2 | `AudioContext.state` spoofing — state always returns `"running"`, `statechange` events blocked |
| 7 | Dynamic iframe protection — applies spoofing to runtime-injected iframes |
| 9 | `requestAnimationFrame` throttling compensation — maintains virtual 60fps timeline in background tabs |
| 8 | Additional hardening — notes on `Reflect.apply`, error stacks, and timing vectors |

### Blocked Detection Events

The extension prevents websites from detecting user behavior at the window/document level:

**Completely Blocked (visibility detection):**
- `visibilitychange`, `webkitvisibilitychange`, `mozvisibilitychange`, `msvisibilitychange`
- `blur`, `focus`, `focusin`, `focusout`
- `mouseleave`, `mouseenter`
- `pagehide`, `pageshow`
- `statechange` (AudioContext)

**Detection Blocked (interaction monitoring):**
- Clipboard: `copy`, `cut`, `paste`, `beforecopy`, `beforecut`, `beforepaste`
- Drag & Drop: `drag`, `dragstart`, `dragend`, `dragover`, `dragenter`, `dragleave`, `drop`
- Context: `contextmenu`

**Note:** Interaction events (copy, paste, etc.) still work normally on page elements - only website-level monitoring is blocked.

---

## File Structure

```
visibility-spoofer/
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker - settings & communication
├── spoof.js           # Main spoofing script (MAIN world)
├── popup.html         # Popup UI markup
├── popup.css          # Popup UI styles
├── popup.js           # Popup UI logic
├── options.html       # Settings page markup
├── options.js         # Settings page logic
├── README.md          # Documentation
└── LICENSE            # MIT License
```

---

## Use Cases

- **Video playback** — prevent videos from pausing when switching tabs
- **Background tasks** — keep timers and animations running in background tabs
- **Development & testing** — test visibility-related functionality
- **Privacy** — prevent websites from tracking tab visibility and user interactions
- **Productivity** — maintain multiple active sessions simultaneously

## Disclaimer

This extension is intended for **personal use and educational purposes** only. Use responsibly and in accordance with the terms of service of the websites you visit. The developers are not responsible for any misuse of this extension.

---

## License

MIT License — feel free to fork, modify, and distribute.
