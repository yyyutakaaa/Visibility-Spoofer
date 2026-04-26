# Visibility Spoofer

A Chrome extension that tricks websites into thinking you're always on the page, even when you switch tabs or minimize the window.

Useful for keeping videos playing, stopping timers from pausing, or preventing sites from knowing when you look away.

---

## What it does

When you switch tabs or minimize Chrome, most websites notice. They pause videos, stop timers, or log that you left. Visibility Spoofer blocks all of that. As far as the website can tell, you're always there.

---

## Installation

There's no store listing. You load it directly from the source files.

**Step 1: Download the extension**

Go to the [Releases page](https://github.com/yyyutakaaa/Visibility-Spoofer/releases) and download the latest `.zip` file. Extract it somewhere you'll remember, like your Downloads folder.

**Step 2: Open your browser's extension page**

In Chrome, Edge, Brave, or any Chromium browser, go to:

```
chrome://extensions
```

**Step 3: Turn on Developer mode**

In the top-right corner of the extensions page, flip the **Developer mode** toggle on.

**Step 4: Load the extension**

Click **Load unpacked**, then select the folder you extracted in Step 1. That's the folder with `manifest.json` inside it, not the zip file itself.

The extension icon should appear in your toolbar. You're done.

---

## How to use it

Click the extension icon in your toolbar to open the popup.

From there you can:
- Turn spoofing on or off for the current site
- See whether it's active (green = on, red = off)
- Open the full settings page to manage your site lists

**Settings page** (click "Manage lists" in the popup):
- Turn spoofing on or off globally
- Add sites to a whitelist (always spoof) or blacklist (never spoof)
- Remove sites from either list

The priority order is: blacklist, then whitelist, then per-site setting, then the global default.

---

## Browser support

Works in Chrome, Edge, Brave, and any other Chromium-based browser. Does not work in Firefox.

---

## Disclaimer

For personal use only. Check the terms of service of any site you use this on, as some prohibit tools that interfere with their monitoring. The developers aren't responsible for how you use it.

---

## License

MIT. Fork it, modify it, do what you want.
