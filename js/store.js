// ═══════════════════════════════════════════════════════════════════
// STORE — localStorage persistence layer
// Load order: seed-data.js → store.js → app.js
// Persisted state: PRODUCTS, ACTIVITY_LOG, HARDWARE_PRODUCT_TYPES,
//                  SOFTWARE_CATEGORY_OPTIONS, SOFTWARE_INDUSTRY_OPTIONS
// ═══════════════════════════════════════════════════════════════════

const Store = (function () {
    const KEY = 'aiso-portal-v2-mvp';
    const VERSION = 1;
    const IMG_MAX_WIDTH = 800;
    const IMG_JPEG_QUALITY = 0.8;

    function serialize() {
        return JSON.stringify({
            version: VERSION,
            savedAt: new Date().toISOString(),
            PRODUCTS,
            ACTIVITY_LOG,
            HARDWARE_PRODUCT_TYPES,
            SOFTWARE_CATEGORY_OPTIONS,
            SOFTWARE_INDUSTRY_OPTIONS,
        });
    }

    function save() {
        try {
            localStorage.setItem(KEY, serialize());
        } catch (e) {
            console.error('Store.save failed:', e);
            if (typeof showToast === 'function') {
                showToast('Save failed — storage quota exceeded. Try removing product images.', 'error');
            }
        }
    }

    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { return false; }
        if (!raw) return false;

        let data;
        try { data = JSON.parse(raw); } catch (e) {
            localStorage.removeItem(KEY);
            return false;
        }
        // Schema changed since this save was written → discard and fall back to seed
        if (!data || data.version !== VERSION) {
            localStorage.removeItem(KEY);
            return false;
        }

        if (Array.isArray(data.PRODUCTS)) PRODUCTS = data.PRODUCTS;
        if (Array.isArray(data.ACTIVITY_LOG)) ACTIVITY_LOG = data.ACTIVITY_LOG;
        if (Array.isArray(data.HARDWARE_PRODUCT_TYPES)) HARDWARE_PRODUCT_TYPES = data.HARDWARE_PRODUCT_TYPES;
        if (Array.isArray(data.SOFTWARE_CATEGORY_OPTIONS)) SOFTWARE_CATEGORY_OPTIONS = data.SOFTWARE_CATEGORY_OPTIONS;
        if (Array.isArray(data.SOFTWARE_INDUSTRY_OPTIONS)) SOFTWARE_INDUSTRY_OPTIONS = data.SOFTWARE_INDUSTRY_OPTIONS;
        return true;
    }

    function reset() {
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        location.reload();
    }

    // Resize + re-encode an image File to a data URL small enough for localStorage.
    // PNG sources keep PNG (preserves icon transparency); everything else becomes JPEG.
    function compressImage(file, maxWidth = IMG_MAX_WIDTH, quality = IMG_JPEG_QUALITY) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.naturalWidth);
                const w = Math.max(1, Math.round(img.naturalWidth * scale));
                const h = Math.max(1, Math.round(img.naturalHeight * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                const isPng = file.type === 'image/png';
                resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Image decode failed'));
            };
            img.src = url;
        });
    }

    return { save, load, reset, compressImage };
})();

// Hydrate state from localStorage (if a valid save exists) before app.js runs.
Store.load();
