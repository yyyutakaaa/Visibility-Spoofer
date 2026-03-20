(function () {
    'use strict';

    var toggle = document.getElementById('toggle');
    var statusEl = document.getElementById('status');
    var footerEl = document.getElementById('footer');

    var currentHostname = null;
    var currentTabId = null;

    function updateUI(enabled) {
        toggle.checked = enabled;
        statusEl.textContent = enabled ? 'Spoofing active' : 'Spoofing disabled';
        if (enabled) {
            statusEl.classList.add('active');
        } else {
            statusEl.classList.remove('active');
        }
        footerEl.textContent = currentHostname
            ? (enabled ? 'active on: ' : 'inactive on: ') + currentHostname
            : '\u2014';
    }

    async function init() {
        try {
            var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            var tab = tabs[0];
            if (!tab || !tab.url) {
                footerEl.textContent = 'no active tab';
                return;
            }

            var url = new URL(tab.url);
            currentHostname = url.hostname;
            currentTabId = tab.id;

            var result = await chrome.storage.local.get(['disabled_sites']);
            var disabledSites = result.disabled_sites || [];
            var enabled = disabledSites.indexOf(currentHostname) === -1;

            updateUI(enabled);
        } catch (_) {
            footerEl.textContent = 'error loading settings';
        }
    }

    toggle.addEventListener('change', async function () {
        var enabled = toggle.checked;
        try {
            var result = await chrome.storage.local.get(['disabled_sites']);
            var disabledSites = result.disabled_sites || [];
            var idx = disabledSites.indexOf(currentHostname);

            if (enabled && idx !== -1) {
                // Turning ON: remove from disabled list
                disabledSites.splice(idx, 1);
            } else if (!enabled && idx === -1) {
                // Turning OFF: add to disabled list
                disabledSites.push(currentHostname);
            }

            await chrome.storage.local.set({ disabled_sites: disabledSites });
            updateUI(enabled);

            // Tell gate.js (isolated world content script) to update
            // sessionStorage before the reload, so the very next
            // document_start already has the correct gate state.
            // If sendMessage fails (e.g. chrome:// page), we reload anyway.
            if (currentTabId) {
                chrome.tabs.sendMessage(
                    currentTabId,
                    { action: 'vs_setDisabled', disabled: !enabled },
                    function () {
                        void chrome.runtime.lastError; // suppress unchecked error
                        chrome.tabs.reload(currentTabId);
                    }
                );
            }
        } catch (_) {
            updateUI(!enabled);
        }
    });

    init();
})();
