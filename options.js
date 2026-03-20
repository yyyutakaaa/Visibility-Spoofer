// Options script voor Visibility Spoofer
(function() {
    'use strict';

    const globalToggle = document.getElementById('globalToggle');
    const whitelistContainer = document.getElementById('whitelistContainer');
    const blacklistContainer = document.getElementById('blacklistContainer');
    const whitelistInput = document.getElementById('whitelistInput');
    const blacklistInput = document.getElementById('blacklistInput');
    const addWhitelistBtn = document.getElementById('addWhitelist');
    const addBlacklistBtn = document.getElementById('addBlacklist');
    const backLink = document.getElementById('backLink');

    // Initialiseer
    init();

    async function init() {
        await loadSettings();
        await renderLists();
    }

    // Laad instellingen
    async function loadSettings() {
        const result = await chrome.storage.local.get(['globalEnabled']);
        globalToggle.checked = result.globalEnabled !== false;
    }

    // Render lijsten
    async function renderLists() {
        const result = await chrome.storage.local.get(['whitelist', 'blacklist']);
        const whitelist = result.whitelist || [];
        const blacklist = result.blacklist || [];

        renderList(whitelistContainer, whitelist, 'whitelist');
        renderList(blacklistContainer, blacklist, 'blacklist');
    }

    // Render een lijst
    function renderList(container, items, type) {
        if (items.length === 0) {
            container.innerHTML = '<div class="empty-state">Geen sites in ' + type + '</div>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="list-item">
                <span>${escapeHtml(item)}</span>
                <button class="remove-btn" data-type="${type}" data-item="${escapeHtml(item)}">
                    Verwijderen
                </button>
            </div>
        `).join('');

        // Event listeners voor verwijder knoppen
        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                removeFromList(this.dataset.type, this.dataset.item);
            });
        });
    }

    // Voeg toe aan lijst
    async function addToList(type, hostname) {
        if (!hostname || hostname.trim() === '') {
            return;
        }

        hostname = hostname.trim().toLowerCase();

        // Valideer hostname
        if (!isValidHostname(hostname)) {
            alert('Ongeldig hostname formaat');
            return;
        }

        const result = await chrome.storage.local.get([type]);
        const list = result[type] || [];

        if (list.includes(hostname)) {
            alert('Deze site staat al in de ' + type);
            return;
        }

        list.push(hostname);
        await chrome.storage.local.set({ [type]: list });
        await renderLists();

        // Clear input
        if (type === 'whitelist') {
            whitelistInput.value = '';
        } else {
            blacklistInput.value = '';
        }
    }

    // Verwijder van lijst
    async function removeFromList(type, hostname) {
        const result = await chrome.storage.local.get([type]);
        const list = result[type] || [];

        const index = list.indexOf(hostname);
        if (index > -1) {
            list.splice(index, 1);
            await chrome.storage.local.set({ [type]: list });
            await renderLists();
        }
    }

    // Valideer hostname
    function isValidHostname(hostname) {
        const regex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;
        return regex.test(hostname);
    }

    // Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Event listeners
    globalToggle.addEventListener('change', async function() {
        await chrome.storage.local.set({ globalEnabled: this.checked });
    });

    addWhitelistBtn.addEventListener('click', function() {
        addToList('whitelist', whitelistInput.value);
    });

    addBlacklistBtn.addEventListener('click', function() {
        addToList('blacklist', blacklistInput.value);
    });

    whitelistInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addToList('whitelist', this.value);
        }
    });

    blacklistInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addToList('blacklist', this.value);
        }
    });

    backLink.addEventListener('click', function(e) {
        e.preventDefault();
        window.close();
    });
})();
