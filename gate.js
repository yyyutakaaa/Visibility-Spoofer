// gate.js — ISOLATED world content script
// Runs at document_start, before spoof.js.
// Reads the disabled state synchronously from sessionStorage (fast path),
// then confirms from chrome.storage.local (authoritative, updates sessionStorage
// so subsequent loads in this tab are also gated synchronously).
// Also listens for messages from popup.js so that sessionStorage is updated
// before the tab is reloaded after a toggle.

(function () {
    'use strict';

    var SS_KEY = '__vs_off';

    // ------------------------------------------------------------------
    // Fast path: sessionStorage survives page reloads within the same tab.
    // When popup.js toggles and reloads, it first sends a message to this
    // script (which updates sessionStorage), then triggers the reload.
    // On the next document_start this synchronous check fires before
    // spoof.js, setting the DOM attribute in time.
    // ------------------------------------------------------------------
    try {
        if (sessionStorage.getItem(SS_KEY) === '1') {
            document.documentElement.setAttribute('data-vs-off', '1');
        }
    } catch (_) { /* private-browsing or sandboxed frame */ }

    // ------------------------------------------------------------------
    // Authoritative path: chrome.storage.local is the source of truth.
    // Read it async; update sessionStorage for future same-tab loads
    // and set the DOM attribute for any detection that runs late.
    // ------------------------------------------------------------------
    chrome.storage.local.get(['disabled_sites'], function (result) {
        var disabled = result.disabled_sites || [];
        var isDisabled = disabled.indexOf(location.hostname) !== -1;
        try {
            if (isDisabled) {
                sessionStorage.setItem(SS_KEY, '1');
                document.documentElement.setAttribute('data-vs-off', '1');
            } else {
                sessionStorage.removeItem(SS_KEY);
                // If spoof.js has not yet read data-vs-off (it runs sync
                // before this callback), removing the attribute here is
                // a no-op for this load but keeps state clean for next load.
                document.documentElement.removeAttribute('data-vs-off');
            }
        } catch (_) { }
    });

    // ------------------------------------------------------------------
    // Message handler: popup.js sends this before reloading the tab.
    // Updating sessionStorage here means the NEXT load's fast path above
    // will see the correct state synchronously, before spoof.js runs.
    // ------------------------------------------------------------------
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
        if (msg.action !== 'vs_setDisabled') return;
        try {
            if (msg.disabled) {
                sessionStorage.setItem(SS_KEY, '1');
            } else {
                sessionStorage.removeItem(SS_KEY);
            }
        } catch (_) { }
        sendResponse({ ok: true });
    });
})();
