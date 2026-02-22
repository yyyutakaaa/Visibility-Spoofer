(function () {
    'use strict';

    // ================================================================
    //  PHASE 0 — NATIVE REFERENCE VAULT
    //  Store references to all original native functions BEFORE anything
    //  is modified. This ensures our code always calls the real versions,
    //  even if the page or another extension patches them later.
    // ================================================================

    const N = Object.freeze({
        defineProperty: Object.defineProperty,
        getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
        getOwnPropertyDescriptors: Object.getOwnPropertyDescriptors,
        getPrototypeOf: Object.getPrototypeOf,
        keys: Object.keys,
        freeze: Object.freeze,
        create: Object.create,
        addEventListener: EventTarget.prototype.addEventListener,
        removeEventListener: EventTarget.prototype.removeEventListener,
        hasFocus: Document.prototype.hasFocus,
        toString: Function.prototype.toString,
        call: Function.prototype.call,
        apply: Function.prototype.apply,
        bind: Function.prototype.bind,
        reflectApply: Reflect.apply,
        reflectGetOwnProp: Reflect.getOwnPropertyDescriptor,
        reflectDefineProperty: Reflect.defineProperty,
        setPrototypeOf: Object.setPrototypeOf,
        MutationObserver: window.MutationObserver,
    });


    // ================================================================
    //  PHASE 1 — ANTI-DETECTION ENGINE
    //  The core of the spoofer. Every function we override must pass
    //  all known detection vectors:
    //    ✓ fn.toString()                → "function name() { [native code] }"
    //    ✓ Function.prototype.toString.call(fn) → same
    //    ✓ fn.name                      → correct name
    //    ✓ fn.length                    → correct arity
    //    ✓ Object.getOwnPropertyDescriptor() → original-shaped descriptor
    //    ✓ Reflect.getOwnPropertyDescriptor() → same
    //    ✓ typeof fn                    → "function"
    //    ✓ fn instanceof Function       → true
    //    ✓ Prototype chain intact
    // ================================================================

    // WeakMap: spoofed function → native function it replaces
    const nativeLookup = new WeakMap();

    /**
     * Register a replacement function so that toString() returns
     * the native code string of the original.
     */
    function cloak(replacement, original) {
        nativeLookup.set(replacement, original);

        // Match .name
        try {
            N.defineProperty(replacement, 'name', {
                configurable: true,
                value: original.name
            });
        } catch (_) { /* some envs lock .name */ }

        // Match .length (arity)
        try {
            N.defineProperty(replacement, 'length', {
                configurable: true,
                value: original.length
            });
        } catch (_) { }

        return replacement;
    }

    // --- Patch Function.prototype.toString ---
    // This is the single most important anti-detection measure.
    // If a site does `document.hasFocus.toString()` it MUST see "[native code]".

    const cloakedToString = function toString() {
        // 'this' is the function whose string representation is requested.
        const original = nativeLookup.get(this);
        if (original) {
            return N.reflectApply(N.toString, original, []);
        }
        return N.reflectApply(N.toString, this, []);
    };

    // toString itself must also appear native
    nativeLookup.set(cloakedToString, N.toString);
    try {
        N.defineProperty(cloakedToString, 'name', { configurable: true, value: 'toString' });
        N.defineProperty(cloakedToString, 'length', { configurable: true, value: 0 });
    } catch (_) { }

    N.defineProperty(Function.prototype, 'toString', {
        configurable: true,
        writable: true,
        value: cloakedToString
    });

    // --- Patch Function.prototype.toString.call / apply / bind detection ---
    // Some sites do: Function.prototype.toString.call(suspectFn)
    // Our patched toString already handles this via the WeakMap lookup.

    // --- Firefox: Function.prototype.toSource ---
    if (typeof Function.prototype.toSource === 'function') {
        const nativeToSource = Function.prototype.toSource;
        const cloakedToSource = function toSource() {
            const original = nativeLookup.get(this);
            if (original) {
                return N.reflectApply(nativeToSource, original, []);
            }
            return N.reflectApply(nativeToSource, this, []);
        };
        cloak(cloakedToSource, nativeToSource);
        N.defineProperty(Function.prototype, 'toSource', {
            configurable: true,
            writable: true,
            value: cloakedToSource
        });
    }


    // ================================================================
    //  PHASE 2 — PROPERTY DESCRIPTOR SPOOFING
    //  Sites can use Object.getOwnPropertyDescriptor(document, 'hidden')
    //  to inspect whether properties have been tampered with. We intercept
    //  these calls and return descriptors that match the original shape.
    // ================================================================

    // Map<object, Map<string, descriptor>>
    const fakeDescriptors = new Map();

    function registerFakeDescriptor(obj, prop, descriptor) {
        let propMap = fakeDescriptors.get(obj);
        if (!propMap) {
            propMap = new Map();
            fakeDescriptors.set(obj, propMap);
        }
        propMap.set(prop, descriptor);
    }

    function lookupFakeDescriptor(obj, prop) {
        const propMap = fakeDescriptors.get(obj);
        return propMap ? propMap.get(prop) : undefined;
    }

    // Patch Object.getOwnPropertyDescriptor
    const cloakedGOPD = function getOwnPropertyDescriptor(obj, prop) {
        const fake = lookupFakeDescriptor(obj, prop);
        if (fake) return Object.assign({}, fake); // return a fresh copy
        return N.reflectApply(N.getOwnPropertyDescriptor, null, [obj, prop]);
    };
    cloak(cloakedGOPD, N.getOwnPropertyDescriptor);
    N.defineProperty(Object, 'getOwnPropertyDescriptor', {
        configurable: true,
        writable: true,
        value: cloakedGOPD
    });

    // Patch Object.getOwnPropertyDescriptors (uses GOPD internally but
    // some engines call the C++ version directly, so we patch this too)
    if (N.getOwnPropertyDescriptors) {
        const cloakedGOPDs = function getOwnPropertyDescriptors(obj) {
            const real = N.reflectApply(N.getOwnPropertyDescriptors, null, [obj]);
            const propMap = fakeDescriptors.get(obj);
            if (propMap) {
                propMap.forEach(function (desc, key) {
                    real[key] = Object.assign({}, desc);
                });
            }
            return real;
        };
        cloak(cloakedGOPDs, N.getOwnPropertyDescriptors);
        N.defineProperty(Object, 'getOwnPropertyDescriptors', {
            configurable: true,
            writable: true,
            value: cloakedGOPDs
        });
    }

    // Patch Reflect.getOwnPropertyDescriptor
    const cloakedReflectGOPD = function getOwnPropertyDescriptor(target, prop) {
        const fake = lookupFakeDescriptor(target, prop);
        if (fake) return Object.assign({}, fake);
        return N.reflectGetOwnProp(target, prop);
    };
    cloak(cloakedReflectGOPD, N.reflectGetOwnProp);
    N.defineProperty(Reflect, 'getOwnPropertyDescriptor', {
        configurable: true,
        writable: true,
        value: cloakedReflectGOPD
    });


    // ================================================================
    //  PHASE 3 — VISIBILITY API SPOOFING
    //  Override all visibility-related properties on `document`.
    //  Use getters (not value descriptors) because the native properties
    //  are accessor descriptors on Document.prototype.
    // ================================================================

    function safeDefine(obj, prop, descriptor) {
        try {
            N.defineProperty(obj, prop, descriptor);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Spoof a visibility property on a given document object.
     * Records a fake descriptor that mimics the original prototype-level
     * descriptor, so inspection returns the expected shape.
     */
    function spoofVisibilityProp(doc, prop, value) {
        // Grab the original descriptor from the prototype chain
        const proto = N.getPrototypeOf(doc);
        const origDesc = N.getOwnPropertyDescriptor(proto, prop)
            || N.getOwnPropertyDescriptor(doc, prop);

        const getter = function () { return value; };

        // If we have an original getter, cloak ours with it
        if (origDesc && origDesc.get) {
            cloak(getter, origDesc.get);
        }

        const newDesc = {
            configurable: true,
            enumerable: true,
            get: getter,
            set: undefined
        };

        const success = safeDefine(doc, prop, newDesc);

        if (success && origDesc) {
            // Register a fake descriptor that looks like the original
            // so Object.getOwnPropertyDescriptor returns the expected shape.
            // We point the getter to the original so toString() on the getter
            // itself also looks native.
            registerFakeDescriptor(doc, prop, {
                configurable: origDesc.configurable !== undefined ? origDesc.configurable : true,
                enumerable: origDesc.enumerable !== undefined ? origDesc.enumerable : true,
                get: origDesc.get || getter,
                set: origDesc.set || undefined
            });
        }
    }

    const VISIBILITY_PROPS = [
        ['visibilityState', 'visible'],
        ['hidden', false],
        ['webkitVisibilityState', 'visible'],
        ['webkitHidden', false],
        ['mozHidden', false],
        ['msHidden', false],
    ];

    for (const [prop, value] of VISIBILITY_PROPS) {
        spoofVisibilityProp(document, prop, value);
    }


    // ================================================================
    //  PHASE 4 — EVENT HANDLER PROPERTY SPOOFING
    //  Neutralise on-event handler properties so sites can't register
    //  visibility callbacks via e.g. document.onvisibilitychange = fn
    // ================================================================

    const HANDLER_PROPS = [
        [window, 'onblur'],
        [window, 'onfocus'],
        [document, 'onvisibilitychange'],
        [document, 'onblur'],
        [document, 'onfocus'],
    ];

    for (const [obj, prop] of HANDLER_PROPS) {
        const proto = N.getPrototypeOf(obj);
        const origDesc = N.getOwnPropertyDescriptor(proto, prop)
            || N.getOwnPropertyDescriptor(obj, prop);

        const getter = function () { return null; };
        const setter = function (_v) { /* silently discard */ };

        if (origDesc) {
            if (origDesc.get) cloak(getter, origDesc.get);
            if (origDesc.set) cloak(setter, origDesc.set);
        }

        safeDefine(obj, prop, {
            configurable: true,
            enumerable: true,
            get: getter,
            set: setter
        });

        // Register fake descriptor matching original shape
        if (origDesc) {
            registerFakeDescriptor(obj, prop, {
                configurable: origDesc.configurable !== undefined ? origDesc.configurable : true,
                enumerable: origDesc.enumerable !== undefined ? origDesc.enumerable : true,
                get: origDesc.get || getter,
                set: origDesc.set || setter
            });
        }
    }


    // ================================================================
    //  PHASE 5 — EVENT LISTENER INTERCEPTION
    //  Block visibility/focus events at the window/document level, but
    //  allow them on child elements so website UIs (dropdowns, form
    //  validation, etc.) continue to work normally.
    // ================================================================

    const BLOCKED_EVENTS = new Set([
        'visibilitychange',
        'webkitvisibilitychange',
        'mozvisibilitychange',
        'msvisibilitychange',
        'blur',
        'focus',
        'focusin',
        'focusout',
        'mouseleave',
        'mouseenter',
        'pagehide',
        'pageshow'
    ]);

    /**
     * Capture-phase blocker — added via the original addEventListener
     * so it isn't intercepted by our own override.
     * Only stops propagation if the target is window or document.
     */
    function captureBlocker(e) {
        const t = e.target;
        if (t === document || t === window || t === document.documentElement) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    }

    for (const eventType of BLOCKED_EVENTS) {
        N.addEventListener.call(document, eventType, captureBlocker, true);
        N.addEventListener.call(window, eventType, captureBlocker, true);
    }

    // --- Override addEventListener ---
    const cloakedAddEventListener = function addEventListener(type, listener, options) {
        // Silently drop visibility-related listeners on window/document
        if ((this === document || this === window) && BLOCKED_EVENTS.has(type)) {
            return undefined;
        }
        return N.reflectApply(N.addEventListener, this, arguments);
    };
    cloak(cloakedAddEventListener, N.addEventListener);
    N.defineProperty(EventTarget.prototype, 'addEventListener', {
        configurable: true,
        writable: true,
        value: cloakedAddEventListener
    });

    // --- Override removeEventListener ---
    const cloakedRemoveEventListener = function removeEventListener(type, listener, options) {
        if ((this === document || this === window) && BLOCKED_EVENTS.has(type)) {
            return undefined;
        }
        return N.reflectApply(N.removeEventListener, this, arguments);
    };
    cloak(cloakedRemoveEventListener, N.removeEventListener);
    N.defineProperty(EventTarget.prototype, 'removeEventListener', {
        configurable: true,
        writable: true,
        value: cloakedRemoveEventListener
    });


    // ================================================================
    //  PHASE 6 — document.hasFocus() OVERRIDE
    // ================================================================

    const cloakedHasFocus = function hasFocus() { return true; };
    cloak(cloakedHasFocus, N.hasFocus);
    N.defineProperty(Document.prototype, 'hasFocus', {
        configurable: true,
        writable: true,
        value: cloakedHasFocus
    });


    // ================================================================
    //  PHASE 7 — DYNAMIC IFRAME PROTECTION
    //  When sites create iframes at runtime, their documents also need
    //  to be spoofed. The manifest's "all_frames": true handles static
    //  iframes, but dynamically-injected same-origin iframes need an
    //  extra push.
    // ================================================================

    function spoofIframeDocument(iframe) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;
            for (const [prop, value] of VISIBILITY_PROPS) {
                spoofVisibilityProp(doc, prop, value);
            }
        } catch (_) {
            // Cross-origin — will be handled by the content script injection
        }
    }

    function scanForIframes(root) {
        if (!root || !root.querySelectorAll) return;
        const iframes = root.querySelectorAll('iframe, frame');
        for (let i = 0; i < iframes.length; i++) {
            spoofIframeDocument(iframes[i]);
        }
    }

    const observer = new N.MutationObserver(function (mutations) {
        for (let m = 0; m < mutations.length; m++) {
            const added = mutations[m].addedNodes;
            for (let n = 0; n < added.length; n++) {
                const node = added[n];
                if (node.nodeType !== 1) continue; // ELEMENT_NODE
                if (node.tagName === 'IFRAME' || node.tagName === 'FRAME') {
                    spoofIframeDocument(node);
                }
                // Also check children of the added node
                scanForIframes(node);
            }
        }
    });

    function startObserver() {
        if (document.documentElement) {
            observer.observe(document.documentElement, { childList: true, subtree: true });
            // Spoof any iframes already in the page
            scanForIframes(document);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
        startObserver();
    }


    // ================================================================
    //  PHASE 8 — ADDITIONAL HARDENING
    // ================================================================

    // --- Protect against Reflect.apply detection ---
    // Some sites do: Reflect.apply(Document.prototype.hasFocus, document, [])
    // Since we replaced hasFocus on the prototype, this is already handled.

    // --- Protect against Error stack trace inspection ---
    // Advanced sites throw errors inside callbacks to check if the stack
    // trace contains extension paths. We can't fully prevent this, but
    // running in "world": "MAIN" means our code runs in the page context
    // so stack traces won't contain chrome-extension:// URLs.

    // --- Protect against timing-based detection ---
    // requestAnimationFrame is throttled in hidden tabs. Since the browser
    // still thinks the tab is hidden at the OS level, rAF will be throttled.
    // There's no clean JS-only fix for this, but most sites don't use this
    // detection vector because it's unreliable.

    // --- Protect against document.createEvent detection ---
    // Some sites dispatch synthetic visibilitychange events and check if
    // they fire. Our capture-phase blocker will stop these too.

    // --- Protect against Worker-based detection ---
    // Web Workers don't have access to document, so they can't directly
    // check visibility. Some use MessageChannel timing, but this is
    // extremely rare and unreliable.


    // ================================================================
    //  NO CONSOLE OUTPUT — LEAVE ZERO TRACES
    //  A console.log would be visible in DevTools and immediately reveal
    //  the spoofer's presence. Stay completely silent.
    // ================================================================

})();
