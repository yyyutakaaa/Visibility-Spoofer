# Visibility Spoofer

A Chrome extension that spoofs the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), making every webpage believe it is always visible and focused — regardless of whether the tab is active or not.

---

## Features

- **Spoofs `document.visibilityState`** → always returns `"visible"`
- **Spoofs `document.hidden`** → always returns `false`
- **Overrides `document.hasFocus()`** → always returns `true`
- **Blocks visibility-related events** (`visibilitychange`, `blur`, `focus`, `pagehide`, etc.) on `window` and `document`
- **Neutralises `on*` handler properties** (`onblur`, `onfocus`, `onvisibilitychange`, etc.)
- **Anti-detection engine** — overridden functions pass all common detection vectors:
  - `fn.toString()` returns `"function name() { [native code] }"`
  - `Object.getOwnPropertyDescriptor()` returns original-shaped descriptors
  - `Reflect.getOwnPropertyDescriptor()` also spoofed
  - Correct `.name` and `.length` on all patched functions
- **Dynamic iframe protection** — newly created iframes are spoofed automatically via `MutationObserver`
- **Runs in `MAIN` world** — no `chrome-extension://` URLs appear in stack traces
- **Zero console output** — leaves no traces in DevTools

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

## How It Works

The extension injects `spoof.js` into every page at `document_start` (before any page scripts run), in the `MAIN` world so it shares the same JavaScript context as the page.

It works in 8 phases:

| Phase | Description |
|-------|-------------|
| 0 | Native reference vault — saves original functions before anything is modified |
| 1 | Anti-detection engine — patches `Function.prototype.toString` via a WeakMap |
| 2 | Property descriptor spoofing — patches `Object/Reflect.getOwnPropertyDescriptor` |
| 3 | Visibility API spoofing — overrides `visibilityState`, `hidden`, and vendor-prefixed variants |
| 4 | Event handler property spoofing — neutralises `onblur`, `onfocus`, `onvisibilitychange`, etc. |
| 5 | Event listener interception — silently drops and blocks visibility events on `window`/`document` |
| 6 | `document.hasFocus()` override — always returns `true` |
| 7 | Dynamic iframe protection — applies spoofing to runtime-injected iframes |
| 8 | Additional hardening — notes on `Reflect.apply`, error stacks, and timing vectors |

---

## File Structure

```
visibility-spoofer/
├── manifest.json   # Extension manifest (Manifest V3)
└── spoof.js        # Core spoofing script
```

---

## Disclaimer

This extension is intended for **personal use and educational purposes** only — for example, preventing video players from pausing when you switch tabs, or keeping background tabs active. Use responsibly and in accordance with the terms of service of the websites you visit.

---

## License

MIT License — feel free to fork, modify, and distribute.
