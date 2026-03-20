// background.js — service worker
// Sole responsibility: initialise chrome.storage.local defaults on install.

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === 'install') {
        chrome.storage.local.get(['disabled_sites'], function (result) {
            if (!result.disabled_sites) {
                chrome.storage.local.set({ disabled_sites: [] });
            }
        });
    }
});
