(function () {
    'use strict';

    // Gate check: gate.js (isolated world, document_start) sets this
    // attribute synchronously from sessionStorage when this site is
    // in the disabled_sites list. If set, skip all spoofing.
    if (document.documentElement &&
        document.documentElement.getAttribute('data-vs-off')) {
        return;
    }

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
        requestAnimationFrame: window.requestAnimationFrame,
        cancelAnimationFrame: window.cancelAnimationFrame,
        perfNow: performance.now.bind(performance),
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
    //  Block visibility/focus events completely on window/document.
    //  For interaction events (copy, paste, keyboard, etc.), only block
    //  detection at window/document level, but allow them on elements.
    // ================================================================

    // Events that are completely blocked (visibility/focus detection)
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

    // Events that are only blocked at window/document level (interaction detection)
    const MONITORED_EVENTS = new Set([
        'copy',
        'cut',
        'paste',
        'drag',
        'dragstart',
        'dragend',
        'dragover',
        'dragenter',
        'dragleave',
        'drop',
        'contextmenu',
        'beforecopy',
        'beforecut',
        'beforepaste'
    ]);

    /**
     * Capture-phase blocker — stops visibility events completely
     */
    function visibilityBlocker(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    /**
     * Capture-phase blocker for interaction events — only blocks at window/document
     * level, but allows events to work on child elements
     */
    function interactionBlocker(e) {
        const t = e.target;
        // Only block if the event is directly on window/document/documentElement
        // This prevents detection at the top level but allows functionality on elements
        if (t === document || t === window || t === document.documentElement) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    }

    // Block visibility events completely on window and document
    for (const eventType of BLOCKED_EVENTS) {
        N.addEventListener.call(document, eventType, visibilityBlocker, true);
        N.addEventListener.call(window, eventType, visibilityBlocker, true);
    }

    // Block interaction event detection at window/document level only
    for (const eventType of MONITORED_EVENTS) {
        N.addEventListener.call(document, eventType, interactionBlocker, true);
        N.addEventListener.call(window, eventType, interactionBlocker, true);
    }

    // --- Override addEventListener ---
    // Only silently drop BLOCKED_EVENTS listeners on window/document
    // MONITORED_EVENTS are allowed to register but will be blocked by capture phase
    /**
     * Check if an EventTarget is a top-level detection surface
     * (window, document, body, or documentElement).
     */
    function isTopLevelTarget(target) {
        return target === window || target === document ||
            target === document.body || target === document.documentElement;
    }

    const cloakedAddEventListener = function addEventListener(type, listener, options) {
        // Silently drop visibility event listeners on top-level targets
        if (isTopLevelTarget(this) && BLOCKED_EVENTS.has(type)) {
            return undefined;
        }
        // Allow all other events, including MONITORED_EVENTS
        // (they're blocked at capture phase instead)
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
        if (isTopLevelTarget(this) && BLOCKED_EVENTS.has(type)) {
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
    //  PHASE 6.1 — navigator.userActivation SPOOFING
    //  Override isActive and hasBeenActive to always return true,
    //  preventing detection via user activation state polling.
    // ================================================================

    try {
        if (typeof navigator !== 'undefined' && navigator.userActivation) {
            const uaProto = N.getPrototypeOf(navigator.userActivation);

            for (const prop of ['isActive', 'hasBeenActive']) {
                const origDesc = N.getOwnPropertyDescriptor(uaProto, prop);
                if (!origDesc || !origDesc.get) continue;

                const getter = function () { return true; };
                cloak(getter, origDesc.get);

                safeDefine(uaProto, prop, {
                    configurable: true,
                    enumerable: true,
                    get: getter
                });

                registerFakeDescriptor(uaProto, prop, {
                    configurable: origDesc.configurable !== undefined ? origDesc.configurable : true,
                    enumerable: origDesc.enumerable !== undefined ? origDesc.enumerable : true,
                    get: origDesc.get,
                    set: origDesc.set || undefined
                });
            }
        }
    } catch (_) { /* UserActivation API not available */ }


    // ================================================================
    //  PHASE 6.2 — AudioContext.state SPOOFING
    //  Override the state getter to always return "running" and block
    //  statechange events, preventing audio-based visibility detection.
    // ================================================================

    try {
        const ACProto = typeof AudioContext !== 'undefined' && AudioContext.prototype;
        if (ACProto) {
            // --- Override state getter ---
            const stateDesc = N.getOwnPropertyDescriptor(ACProto, 'state');
            if (stateDesc && stateDesc.get) {
                const stateGetter = function () { return 'running'; };
                cloak(stateGetter, stateDesc.get);

                safeDefine(ACProto, 'state', {
                    configurable: true,
                    enumerable: true,
                    get: stateGetter
                });

                registerFakeDescriptor(ACProto, 'state', {
                    configurable: stateDesc.configurable !== undefined ? stateDesc.configurable : true,
                    enumerable: stateDesc.enumerable !== undefined ? stateDesc.enumerable : true,
                    get: stateDesc.get,
                    set: stateDesc.set || undefined
                });
            }

            // --- Block onstatechange handler property ---
            const oscDesc = N.getOwnPropertyDescriptor(ACProto, 'onstatechange');
            if (oscDesc) {
                const oscGetter = function () { return null; };
                const oscSetter = function (_v) { /* silently discard */ };
                if (oscDesc.get) cloak(oscGetter, oscDesc.get);
                if (oscDesc.set) cloak(oscSetter, oscDesc.set);

                safeDefine(ACProto, 'onstatechange', {
                    configurable: true,
                    enumerable: true,
                    get: oscGetter,
                    set: oscSetter
                });

                registerFakeDescriptor(ACProto, 'onstatechange', {
                    configurable: oscDesc.configurable !== undefined ? oscDesc.configurable : true,
                    enumerable: oscDesc.enumerable !== undefined ? oscDesc.enumerable : true,
                    get: oscDesc.get || oscGetter,
                    set: oscDesc.set || oscSetter
                });
            }
        }
    } catch (_) { /* AudioContext API not available */ }

    // Add statechange to blocked events set (used by capture-phase blocker)
    BLOCKED_EVENTS.add('statechange');


    // ================================================================
    //  PHASE 7 — DYNAMIC IFRAME PROTECTION
    //  When sites create iframes at runtime, their documents also need
    //  to be spoofed. The manifest's "all_frames": true handles static
    //  iframes, but dynamically-injected same-origin iframes need an
    //  extra push.
    // ================================================================

    // Handler property names, split by target type, so we can re-derive
    // them for each iframe's own window/document objects.
    const WINDOW_HANDLER_NAMES = ['onblur', 'onfocus'];
    const DOC_HANDLER_NAMES = ['onvisibilitychange', 'onblur', 'onfocus'];

    /**
     * Apply full spoofing to a same-origin iframe.
     *
     * Each same-origin iframe has its own JS realm with distinct
     * prototypes (Function.prototype, EventTarget.prototype,
     * Document.prototype, etc.). We must patch each realm
     * independently — references from the outer scope only work for
     * shared-prototype cases, which same-origin iframes are NOT.
     *
     * Cross-origin iframes will throw on `iframe.contentDocument`
     * access and are caught by the outer try/catch. Cross-origin
     * frames must rely on the manifest's "all_frames": true +
     * "world": "MAIN" content script injection, which causes the
     * browser to run spoof.js independently in each frame's world.
     * However, dynamically-inserted cross-origin iframes whose src
     * is set AFTER insertion may not receive the content script if
     * the browser has already committed the about:blank navigation.
     * There is no JS-level workaround for this — it is a browser
     * security boundary.
     */
    function spoofIframeDocument(iframe) {
        try {
            const iDoc = iframe.contentDocument;
            if (!iDoc) return;

            const iWin = iframe.contentWindow;
            if (!iWin) return;

            // Guard against double-patching (e.g. MutationObserver fires
            // multiple times for the same iframe).
            if (iDoc.__vsSpoofed) return;
            try {
                N.defineProperty(iDoc, '__vsSpoofed', {
                    value: true, configurable: false, enumerable: false, writable: false
                });
            } catch (_) { return; }

            // ----------------------------------------------------------
            //  1. Patch the iframe's Function.prototype.toString
            //     so that cloaked functions pass toString() checks when
            //     called from inside the iframe's realm.
            //     We reuse the outer nativeLookup WeakMap — functions
            //     registered via cloak() in the outer scope are still
            //     found because WeakMap keys are identity-based, not
            //     realm-based.
            // ----------------------------------------------------------
            try {
                const iFP = iWin.Function.prototype;
                const iNativeToString = iFP.toString;

                const iCloakedToString = function toString() {
                    const original = nativeLookup.get(this);
                    if (original) {
                        return N.reflectApply(N.toString, original, []);
                    }
                    // Fall back to the iframe's own native toString for
                    // functions we haven't cloaked.
                    return N.reflectApply(iNativeToString, this, []);
                };

                nativeLookup.set(iCloakedToString, iNativeToString);
                try {
                    N.defineProperty(iCloakedToString, 'name', { configurable: true, value: 'toString' });
                    N.defineProperty(iCloakedToString, 'length', { configurable: true, value: 0 });
                } catch (_) { }

                N.defineProperty(iFP, 'toString', {
                    configurable: true,
                    writable: true,
                    value: iCloakedToString
                });
            } catch (_) { /* locked prototype — best-effort */ }

            // ----------------------------------------------------------
            //  2. Phase 3 — Visibility property spoofing
            // ----------------------------------------------------------
            for (const [prop, value] of VISIBILITY_PROPS) {
                spoofVisibilityProp(iDoc, prop, value);
            }

            // ----------------------------------------------------------
            //  3. Phase 4 — Handler property spoofing
            //     Neutralise on* handler properties on the iframe's
            //     own window and document.
            // ----------------------------------------------------------
            function spoofHandlerProp(obj, prop) {
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

                if (origDesc) {
                    registerFakeDescriptor(obj, prop, {
                        configurable: origDesc.configurable !== undefined ? origDesc.configurable : true,
                        enumerable: origDesc.enumerable !== undefined ? origDesc.enumerable : true,
                        get: origDesc.get || getter,
                        set: origDesc.set || setter
                    });
                }
            }

            for (const prop of WINDOW_HANDLER_NAMES) {
                spoofHandlerProp(iWin, prop);
            }
            for (const prop of DOC_HANDLER_NAMES) {
                spoofHandlerProp(iDoc, prop);
            }

            // ----------------------------------------------------------
            //  4. Phase 5 — Capture-phase event blockers + addEventListener
            //     interception on the iframe's own EventTarget.prototype.
            // ----------------------------------------------------------

            // 4a. Install capture-phase blockers on the iframe's targets.
            //     We reuse the outer visibilityBlocker / interactionBlocker
            //     functions — they reference the event object only, so they
            //     work cross-realm.
            for (const eventType of BLOCKED_EVENTS) {
                N.addEventListener.call(iDoc, eventType, visibilityBlocker, true);
                N.addEventListener.call(iWin, eventType, visibilityBlocker, true);
            }
            for (const eventType of MONITORED_EVENTS) {
                N.addEventListener.call(iDoc, eventType, interactionBlocker, true);
                N.addEventListener.call(iWin, eventType, interactionBlocker, true);
            }

            // 4b. Patch the iframe's EventTarget.prototype.addEventListener
            //     and removeEventListener. We must build a fresh
            //     isTopLevelTarget that knows about THIS iframe's
            //     window/document, not the outer ones.
            try {
                const iETP = iWin.EventTarget.prototype;
                const iNativeAEL = iETP.addEventListener;
                const iNativeREL = iETP.removeEventListener;

                const iCloakedAEL = function addEventListener(type, listener, options) {
                    if ((this === iDoc || this === iWin ||
                         this === iDoc.body || this === iDoc.documentElement) &&
                        BLOCKED_EVENTS.has(type)) {
                        return undefined;
                    }
                    return N.reflectApply(iNativeAEL, this, arguments);
                };
                cloak(iCloakedAEL, iNativeAEL);
                N.defineProperty(iETP, 'addEventListener', {
                    configurable: true,
                    writable: true,
                    value: iCloakedAEL
                });

                const iCloakedREL = function removeEventListener(type, listener, options) {
                    if ((this === iDoc || this === iWin ||
                         this === iDoc.body || this === iDoc.documentElement) &&
                        BLOCKED_EVENTS.has(type)) {
                        return undefined;
                    }
                    return N.reflectApply(iNativeREL, this, arguments);
                };
                cloak(iCloakedREL, iNativeREL);
                N.defineProperty(iETP, 'removeEventListener', {
                    configurable: true,
                    writable: true,
                    value: iCloakedREL
                });
            } catch (_) { /* locked EventTarget — best-effort */ }

            // ----------------------------------------------------------
            //  5. Phase 6 — hasFocus() override on the iframe's
            //     Document.prototype.
            // ----------------------------------------------------------
            try {
                const iDocProto = N.getPrototypeOf(iDoc);
                const iNativeHasFocus = iDocProto.hasFocus || iDoc.hasFocus;

                const iCloakedHasFocus = function hasFocus() { return true; };
                cloak(iCloakedHasFocus, iNativeHasFocus);

                N.defineProperty(iDocProto, 'hasFocus', {
                    configurable: true,
                    writable: true,
                    value: iCloakedHasFocus
                });
            } catch (_) { /* locked prototype — best-effort */ }

        } catch (_) {
            // Cross-origin iframe — contentDocument access throws a
            // DOMException (SecurityError). These frames cannot be
            // patched from the parent context. They rely on the
            // manifest's content_scripts configuration:
            //   "all_frames": true, "world": "MAIN"
            // which causes the browser to inject spoof.js into each
            // frame independently at document_start. This covers
            // static cross-origin iframes and those whose src is set
            // before insertion. Dynamically-inserted cross-origin
            // frames whose src changes after DOM insertion may miss
            // the content script injection window — there is no
            // JS-level workaround for this browser limitation.
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
    //  PHASE 9 — requestAnimationFrame THROTTLING COMPENSATION
    //  Browsers throttle rAF to ~1fps (or pause entirely) in background
    //  tabs. Sites can measure the timestamp delta between frames to
    //  detect this. We maintain a virtual timeline that always advances
    //  at ~60fps, clamping the DOMHighResTimeStamp passed to callbacks
    //  so animations and delta-time checks see a consistent cadence.
    // ================================================================

    (function () {
        const FRAME_BUDGET = 1000 / 60;          // ~16.667ms per frame
        // Tolerate up to 3× a normal frame before considering it throttled.
        // This avoids clamping during legitimate jank on a visible tab.
        const THROTTLE_THRESHOLD = FRAME_BUDGET * 3;

        // Virtual timeline state
        let virtualTime = -1;                     // -1 = uninitialised
        let lastRealTime = -1;

        // Bookkeeping: real rAF id → { callback, cancelled }
        const pending = new Map();

        /**
         * Advance the virtual clock.
         * If the real delta since the last frame exceeds the throttle
         * threshold we clamp the advance to one ideal frame, keeping
         * the virtual timeline smooth. Otherwise we advance by the
         * real delta so foreground behaviour is unaffected.
         */
        function advanceVirtualTime(realNow) {
            if (virtualTime < 0) {
                // First frame — seed from the real timestamp
                virtualTime = realNow;
                lastRealTime = realNow;
                return virtualTime;
            }

            const realDelta = realNow - lastRealTime;
            lastRealTime = realNow;

            if (realDelta > THROTTLE_THRESHOLD) {
                // Background-throttled frame — advance by exactly one
                // ideal frame so the consumer sees a steady 60fps cadence.
                virtualTime += FRAME_BUDGET;
            } else {
                // Normal foreground frame — pass the real delta through
                // so we don't introduce artificial jitter.
                virtualTime += realDelta;
            }

            return virtualTime;
        }

        // --- Patched requestAnimationFrame ---
        const cloakedRAF = function requestAnimationFrame(callback) {
            if (typeof callback !== 'function') {
                // Match native behaviour: throw TypeError for non-functions
                return N.reflectApply(N.requestAnimationFrame, window, [callback]);
            }

            const entry = { callback: callback, cancelled: false };

            const realId = N.reflectApply(N.requestAnimationFrame, window, [
                function (realTimestamp) {
                    if (entry.cancelled) return;
                    pending.delete(realId);
                    const virtualTs = advanceVirtualTime(realTimestamp);
                    entry.callback(virtualTs);
                }
            ]);

            entry.realId = realId;
            pending.set(realId, entry);
            return realId;
        };
        cloak(cloakedRAF, N.requestAnimationFrame);
        N.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: cloakedRAF
        });

        // --- Patched cancelAnimationFrame ---
        const cloakedCAF = function cancelAnimationFrame(id) {
            const entry = pending.get(id);
            if (entry) {
                entry.cancelled = true;
                pending.delete(id);
            }
            // Always forward to the real cAF so the browser can
            // release the underlying frame request.
            return N.reflectApply(N.cancelAnimationFrame, window, [id]);
        };
        cloak(cloakedCAF, N.cancelAnimationFrame);
        N.defineProperty(window, 'cancelAnimationFrame', {
            configurable: true,
            writable: true,
            value: cloakedCAF
        });
    })();

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
