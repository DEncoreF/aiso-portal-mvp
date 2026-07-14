// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function esc(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function logActivity(action, productName, detail = '', pid = null) {
    const ts = new Date().toISOString();
    const entry = { action, productName, detail, timestamp: ts, user: currentUser?.name || 'System' };
    ACTIVITY_LOG.unshift(entry);
    if (ACTIVITY_LOG.length > 50) ACTIVITY_LOG.length = 50;
    // Also write to product history
    const p = pid ? PRODUCTS.find(x => x.id === pid) : PRODUCTS.find(x => x.name === productName);
    if (p) {
        if (!p.history) p.history = [];
        p.history.unshift({ action, detail, timestamp: ts, user: entry.user });
    }
    Store.save();
}

function canManageProduct(p) { return true; /* Super Admin has full access */ }
function getSwCategories(p) { return p.categories?.length ? p.categories : (p.sub_category ? [p.sub_category] : []); }
function findCompatRefs(hwId) { return PRODUCTS.filter(p => p.product_type === 'software' && p.status !== 'archived' && (p.compatible_hardware || []).includes(hwId)); }
function getVisibleProducts(type) { return PRODUCTS.filter(p => p.product_type === type && p.status !== 'archived'); }
function getAllProducts(type) { return PRODUCTS.filter(p => p.product_type === type); }
function getUserInitials(name = '') { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function isSuperAdmin() { return true; }
function isAdmin() { return true; }

function statusBadge(s) {
    const m = {
        published: '<span class="badge badge-published">Published</span>',
        draft: '<span class="badge badge-draft">Draft</span>',
        archived: '<span class="badge badge-archived">Archived</span>',
    };
    return m[s] || `<span class="badge badge-zinc">${esc(s)}</span>`;
}

function showToast(msg, type = 'success') {
    const el = document.createElement('div');
    // Toasts use only two colors: red for errors and blocking messages,
    // green for every success confirmation (including the completion of
    // destructive actions such as a permanent delete).
    const isRed = type === 'error' || type === 'warning' || type === 'danger';
    el.className = `toast-animate text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg ${isRed ? 'bg-red-600' : 'bg-emerald-600'}`;
    el.textContent = msg;
    document.getElementById('toast-root').appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function showModal(html, wide = false) {
    const root = document.getElementById('modal-root');
    const modalClass = wide === 'edit' ? 'modal-edit' : wide ? 'modal-wide' : '';
    root.innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal-card ${modalClass}">${html}</div></div>`;
}

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// ── Shared empty state ──
// Centered icon + gray message (+ optional CTA/extra HTML). Every list routes
// its empty state through here so they look and read the same across the app.
function emptyState(icon, message, extra = '') {
    return `<div class="flex flex-col items-center gap-3">
        <i class="ph ${esc(icon)} text-4xl text-[#c7c7cc]"></i>
        <div class="text-sm text-[#86868b] font-semibold">${esc(message)}</div>
        ${extra}
    </div>`;
}

// ── Shared HTTP error screen ──
// Same visual language as the empty state: centered icon + status code + copy,
// plus an optional action button. Intended for future API wiring; previewable
// today from Settings → Error State Demo.
function renderErrorState(code, actionHtml = '') {
    const message = (typeof HTTP_ERROR_MESSAGES !== 'undefined' && HTTP_ERROR_MESSAGES[code])
        || 'Something went wrong. Please try again later.';
    return `<div class="flex flex-col items-center gap-3 text-center" style="padding:1rem 0">
        <i class="ph ph-warning-octagon text-[#c7c7cc]" style="font-size:3rem"></i>
        <div class="text-2xl font-bold text-[#1d1d1f]">${esc(String(code))}</div>
        <div class="text-sm text-[#86868b] font-semibold" style="max-width:360px">${esc(message)}</div>
        ${actionHtml}
    </div>`;
}

function showErrorStateDemo(code) {
    showModal(renderErrorState(code, '<button onclick="closeModal()" class="btn-primary" style="margin-top:8px"><i class="ph ph-arrow-left"></i> Back</button>'));
}

// ═══════════════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════════════════════════

// Login does NOT persist — every page load shows the login screen (in-memory only).
function clearLoginFields() {
    const emailEl = document.getElementById('login-email');
    const pwEl = document.getElementById('login-password');
    if (emailEl) { emailEl.value = ''; emailEl.classList.remove('field-error'); }
    if (pwEl) { pwEl.value = ''; pwEl.classList.remove('field-error'); }
    const emailErr = document.getElementById('login-email-error');
    const pwErr = document.getElementById('login-password-error');
    if (emailErr) emailErr.textContent = '';
    if (pwErr) pwErr.textContent = '';
    // Reset password visibility
    if (pwEl) pwEl.type = 'password';
    const eye = document.getElementById('login-pw-eye');
    if (eye) eye.className = 'ph ph-eye';
}

function initPortal() {
    // Keep the user logged in across page reloads (cleared on Logout or tab close)
    try { if (sessionStorage.getItem('aiso-portal-auth') === '1') { enterApp(); return; } } catch (e) {}
    currentUser = null;
    const screen = document.getElementById('login-screen');
    if (screen) screen.style.display = 'flex';
    clearLoginFields();
    updateLoginSubmitState();
    const emailEl = document.getElementById('login-email');
    if (emailEl) emailEl.focus();
}

// ── Login field validation ──
function validateLoginEmail(v) {
    if (!v) return 'Email is required.';
    if (v.length > 100) return 'Email must be 100 characters or fewer.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
    return '';
}
function validateLoginPassword(v) {
    if (!v) return 'Password is required.';
    if (v.length > 100) return 'Password must be 100 characters or fewer.';
    return '';
}

function validateLoginField(which) {
    const input = document.getElementById('login-' + which);
    const errEl = document.getElementById('login-' + which + '-error');
    if (!input) return '';
    const v = (input.value || '').trim();
    const msg = which === 'email' ? validateLoginEmail(v) : validateLoginPassword(v);
    if (errEl) errEl.textContent = msg;
    input.classList.toggle('field-error', !!msg);
    updateLoginSubmitState();
    return msg;
}

function onLoginInput(which) {
    const input = document.getElementById('login-' + which);
    const errEl = document.getElementById('login-' + which + '-error');
    // If the field currently shows an error, re-run to clear it live when valid
    if (errEl && errEl.textContent) {
        const v = (input.value || '').trim();
        const msg = which === 'email' ? validateLoginEmail(v) : validateLoginPassword(v);
        if (!msg) { errEl.textContent = ''; input.classList.remove('field-error'); }
    }
    updateLoginSubmitState();
}

function updateLoginSubmitState() {
    const emailEl = document.getElementById('login-email');
    const pwEl = document.getElementById('login-password');
    const btn = document.getElementById('login-submit');
    if (!btn) return;
    const emailOk = emailEl && !validateLoginEmail((emailEl.value || '').trim());
    const pwOk = pwEl && !validateLoginPassword((pwEl.value || '').trim());
    btn.disabled = !(emailOk && pwOk);
}

function toggleLoginPassword() {
    const pwEl = document.getElementById('login-password');
    const eye = document.getElementById('login-pw-eye');
    if (!pwEl) return;
    const show = pwEl.type === 'password';
    pwEl.type = show ? 'text' : 'password';
    if (eye) eye.className = show ? 'ph ph-eye-slash' : 'ph ph-eye';
}

function login() {
    const btn = document.getElementById('login-submit');
    if (btn && btn.disabled) return;
    const email = (document.getElementById('login-email').value || '').trim();
    const password = (document.getElementById('login-password').value || '').trim();
    const emailEl = document.getElementById('login-email');
    const pwEl = document.getElementById('login-password');
    const emailErr = document.getElementById('login-email-error');
    const pwErr = document.getElementById('login-password-error');
    if (email.toLowerCase() === DEMO_LOGIN.email.toLowerCase() && password === DEMO_LOGIN.password) {
        if (emailErr) emailErr.textContent = '';
        if (pwErr) pwErr.textContent = '';
        if (emailEl) emailEl.classList.remove('field-error');
        if (pwEl) pwEl.classList.remove('field-error');
        enterApp();
    } else {
        const incorrect = 'The Email or Password you entered is incorrect.';
        if (emailEl) emailEl.classList.add('field-error');
        if (pwEl) pwEl.classList.add('field-error');
        if (emailErr) emailErr.textContent = incorrect;
        if (pwErr) pwErr.textContent = incorrect;
    }
}

function enterApp() {
    currentUser = { ...SUPER_ADMIN_USER };
    try { sessionStorage.setItem('aiso-portal-auth', '1'); } catch (e) {}
    if (typeof closeUserMenu === 'function') closeUserMenu();
    const screen = document.getElementById('login-screen');
    if (screen) screen.style.display = 'none';

    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-role').textContent = currentUser.label;
    document.getElementById('user-avatar').textContent = getUserInitials(currentUser.name);

    // Build nav
    const navEl = document.getElementById('dynamic-nav');
    navEl.innerHTML = NAV_ITEMS.map(n => `
        <button class="nav-item" data-nav="${n.key}" onclick="navigate('${n.key}')">
            <span class="nav-icon"><i class="ph ${n.icon}"></i></span>
            <span>${esc(n.label)}</span>
        </button>
    `).join('');

    // Navigate to first
    navigate(NAV_ITEMS[0].key);
}

function logout() {
    try { sessionStorage.removeItem('aiso-portal-auth'); } catch (e) {}
    closeModal();
    if (typeof closeSwPreview === 'function') closeSwPreview();
    if (typeof closeUserMenu === 'function') closeUserMenu();
    currentUser = null;
    const screen = document.getElementById('login-screen');
    if (screen) screen.style.display = 'flex';
    clearLoginFields();
    updateLoginSubmitState();
    const emailEl = document.getElementById('login-email');
    if (emailEl) emailEl.focus();
}

function forgotPassword() {
    showToast('Please contact your administrator to reset your password.', 'info');
}

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════

function setPageHeader(title, subtitle, actionHtml) {
    const h = document.getElementById('page-heading');
    if (h) h.innerHTML = title ? `<h2 class="text-2xl font-bold" style="letter-spacing:-0.03em">${esc(title)}</h2>${subtitle ? `<p class="text-sm mt-1" style="color:#86868b">${esc(subtitle)}</p>` : ''}` : '';
    const a = document.getElementById('page-action');
    if (a) a.innerHTML = actionHtml || '';
}

function navigate(key) {
    currentView = key;
    // Toggle views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const targetEl = document.getElementById('view-' + key);
    if (targetEl) targetEl.classList.remove('hidden');

    // Active nav
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const active = document.querySelector(`.nav-item[data-nav="${key}"]`);
    if (active) active.classList.add('active');

    // Shared header (title + optional subtitle + per-view action)
    const meta = {
        'sw-products': { title: 'Software Products', action: `<button onclick="showCreateProductModal('software')" class="btn-primary" id="sw-create-btn"><i class="ph ph-plus"></i> Add Software</button>` },
        'hw-products': { title: 'Hardware Products', action: `<button onclick="showCreateProductModal('hardware')" class="btn-primary" id="hw-create-btn"><i class="ph ph-plus"></i> Add Hardware</button>` },
        'param-center': { title: 'Parameter Center', subtitle: 'System-level parameters managed exclusively by Super Admin.' },
        'activity-log': { title: 'Activity Log', subtitle: 'Recent actions performed in this session.', action: `<button onclick="ACTIVITY_LOG=[];Store.save();renderActivityLog();showToast('Log cleared')" class="btn-secondary"><i class="ph ph-trash"></i> Clear</button>` },
        'settings': { title: 'Settings' },
    }[key] || {};
    setPageHeader(meta.title || '', meta.subtitle || '', meta.action || '');

    // Render
    if (key === 'sw-products') renderSwProducts();
    else if (key === 'hw-products') renderHwProducts();
    else if (key === 'param-center') renderParamCenter();
    else if (key === 'activity-log') renderActivityLog();
    else if (key === 'settings') renderSettings();
}

// ═══════════════════════════════════════════════════════════════════
// SOFTWARE PRODUCT LIST
// ═══════════════════════════════════════════════════════════════════

const PRODUCT_PAGE_SIZE = 10;
const productPageState = { software: 1, hardware: 1 };

function resetProductPage(type) {
    productPageState[type] = 1;
}

function setProductPage(type, page) {
    const nextPage = Number.parseInt(page, 10);
    if (!Number.isFinite(nextPage)) return;
    productPageState[type] = Math.max(1, nextPage);
    if (type === 'software') renderSwProducts();
    else renderHwProducts();
}

function paginateProductList(list, type) {
    const totalPages = Math.max(1, Math.ceil(list.length / PRODUCT_PAGE_SIZE));
    const currentPage = Math.min(Math.max(productPageState[type] || 1, 1), totalPages);
    productPageState[type] = currentPage;
    const startIndex = (currentPage - 1) * PRODUCT_PAGE_SIZE;
    return {
        currentPage,
        totalPages,
        startIndex,
        items: list.slice(startIndex, startIndex + PRODUCT_PAGE_SIZE),
    };
}

function renderProductPagination(type, totalItems, currentPage, totalPages) {
    const prefix = type === 'software' ? 'sw' : 'hw';
    const target = document.getElementById(`${prefix}-products-pagination`);
    if (!target) return;
    if (totalItems <= PRODUCT_PAGE_SIZE) {
        target.innerHTML = '';
        return;
    }

    const firstItem = (currentPage - 1) * PRODUCT_PAGE_SIZE + 1;
    const lastItem = Math.min(currentPage * PRODUCT_PAGE_SIZE, totalItems);
    const pageStart = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    const pageEnd = Math.min(totalPages, pageStart + 4);
    const pageButtons = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i).map(page =>
        `<button type="button" onclick="setProductPage('${type}',${page})" class="${page === currentPage ? 'btn-primary' : 'btn-ghost'}" style="min-width:32px;height:32px;padding:0 9px;justify-content:center">${page}</button>`
    ).join('');
    const navButton = (label, page, disabled = false) => `<button type="button" ${disabled ? 'disabled' : `onclick="setProductPage('${type}',${page})"`} class="btn-ghost" style="font-size:12px;${disabled ? 'opacity:.35;cursor:not-allowed' : ''}">${label}</button>`;

    target.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 4px;border-top:1px solid var(--border-light);flex-wrap:wrap">
        <span style="font-size:12px;color:#86868b;font-weight:500">${firstItem}-${lastItem} of ${totalItems} items</span>
        <div style="display:flex;align-items:center;gap:4px">
            ${navButton('« First', 1, currentPage === 1)}
            ${navButton('‹ Prev', currentPage - 1, currentPage === 1)}
            ${pageButtons}
            ${navButton('Next ›', currentPage + 1, currentPage === totalPages)}
            ${navButton('Last »', totalPages, currentPage === totalPages)}
        </div>
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#86868b;font-weight:500">Go to Page
            <input type="number" min="1" max="${totalPages}" value="${currentPage}" aria-label="Go to page" onchange="setProductPage('${type}',Math.min(Math.max(this.value,1),${totalPages}))" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}" class="input-field" style="width:58px;padding:6px 8px;margin:0;text-align:center">
            <span>/ ${totalPages}</span>
        </label>
    </div>`;
}

function setSwFilter(val) {
    document.getElementById('sw-filter-status').value = val;
    document.querySelectorAll('#sw-filter-tabs .filter-tab').forEach(b => b.classList.toggle('active', b.dataset.val === val));
    resetProductPage('software');
    renderSwProducts();
}

function setHwFilter(val) {
    document.getElementById('hw-filter-status').value = val;
    document.querySelectorAll('#hw-filter-tabs .filter-tab').forEach(b => b.classList.toggle('active', b.dataset.val === val));
    resetProductPage('hardware');
    renderHwProducts();
}

function renderSwProducts() {
    const all = getAllProducts('software');
    const searchQ = (document.getElementById('sw-search')?.value || '').toLowerCase();
    const filterS = document.getElementById('sw-filter-status')?.value || '';
    let list = all.filter(p => {
        if (!filterS && p.status === 'archived') return false;
        if (filterS && p.status !== filterS) return false;
        if (searchQ && !p.name.toLowerCase().includes(searchQ) && !p.vendor_name.toLowerCase().includes(searchQ) && !getSwCategories(p).some(c => c.toLowerCase().includes(searchQ))) return false;
        return true;
    });
    list = applySorting(list, 'software');
    renderStatsBar('sw-stats-bar', all);
    const page = paginateProductList(list, 'software');

    document.getElementById('sw-products-tbody').innerHTML = list.length ? page.items.map(p => `
        <tr class="cursor-pointer" onclick="if(!event.target.closest('button'))showSwDetail('${p.id}')">
            <td>
                <div class="flex items-center gap-3">
                    <div style="width:36px;height:36px;border-radius:10px;background:#f5f5f7;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#86868b;flex-shrink:0">${esc(p.name.slice(0,2).toUpperCase())}</div>
                    <div>
                        <div style="font-weight:600;font-size:13.5px;color:#1d1d1f">${esc(p.name)}</div>
                        <div style="font-size:12px;color:#86868b;margin-top:1px">${esc(getSwCategories(p).join(', '))}</div>
                    </div>
                </div>
            </td>
            <td><span style="color:#86868b;font-size:13px">${esc(p.vendor_name)}</span></td>
            <td><div style="display:flex;flex-wrap:wrap;gap:4px">${getSwCategories(p).slice(0, 3).map(c => `<span class="badge badge-zinc">${esc(c)}</span>`).join('')}</div></td>
            <td>${statusBadge(p.status)}</td>
            <td class="text-right" onclick="event.stopPropagation()">
                <div class="flex items-center gap-0.5 justify-end">
                    ${p.status !== 'archived' ? `<button onclick="showEditProductModal('${p.id}', 'list')" class="btn-ghost" title="Edit"><i class="ph ph-pencil-simple"></i></button>` : ''}
                    ${productActionBtns(p)}
                </div>
            </td>
        </tr>
    `).join('') : `<tr><td colspan="5" class="text-center py-16">${emptyState(
        'ph-app-window',
        searchQ ? EMPTY_STATE_NO_RESULTS : EMPTY_STATE_NO_DATA,
        !searchQ && !filterS ? '<button onclick="showCreateProductModal(\'software\')" class="btn-primary text-xs mt-1"><i class="ph ph-plus-circle"></i> Add Software</button>' : ''
    )}</td></tr>`;
    renderProductPagination('software', list.length, page.currentPage, page.totalPages);
}

function productActionBtns(p) {
    let btns = '';
    if (p.status === 'archived') {
        btns += `<button onclick="restoreProduct('${p.id}')" class="btn-ghost" style="color:#059669" title="Restore"><i class="ph ph-arrow-counter-clockwise"></i></button>`;
        btns += `<button onclick="confirmDeleteProduct('${p.id}')" class="btn-ghost" style="color:#dc2626" title="Delete permanently"><i class="ph ph-trash"></i></button>`;
    } else if (p.status === 'published') {
        btns += `<button onclick="confirmUnpublish('${p.id}')" class="btn-ghost" style="color:#d97706" title="Unpublish"><i class="ph ph-arrow-line-down"></i></button>`;
        btns += `<button onclick="archiveProduct('${p.id}')" class="btn-ghost" style="color:#7c3aed" title="Archive"><i class="ph ph-archive"></i></button>`;
    } else {
        btns += `<button onclick="togglePublish('${p.id}')" class="btn-ghost" style="color:#059669" title="Publish"><i class="ph ph-arrow-line-up"></i></button>`;
        btns += `<button onclick="archiveProduct('${p.id}')" class="btn-ghost" style="color:#7c3aed" title="Archive"><i class="ph ph-archive"></i></button>`;
        btns += `<button onclick="confirmDeleteProduct('${p.id}')" class="btn-ghost" style="color:#dc2626" title="Delete"><i class="ph ph-trash"></i></button>`;
    }
    return btns;
}

// ── Sorting ──
function toggleSort(type, key) {
    const s = sortState[type];
    if (s.key === key) { s.dir = s.dir === 'asc' ? 'desc' : 'asc'; }
    else { s.key = key; s.dir = 'asc'; }
    if (type === 'software') renderSwProducts();
    else renderHwProducts();
}

function applySorting(list, type) {
    const s = sortState[type];
    if (!s.key) return list;
    const dir = s.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
        const va = String(a[s.key] || '').toLowerCase();
        const vb = String(b[s.key] || '').toLowerCase();
        return va < vb ? -dir : va > vb ? dir : 0;
    });
}

// ── Stats Bar ──
function renderStatsBar(containerId, all) {
    const target = document.getElementById(containerId);
    if (!target) return;
    const counts = { total: all.length, published: 0, draft: 0, archived: 0 };
    all.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
    const chip = (label, count, color) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:12px;background:#fafbfc;border:1px solid var(--border-light);min-width:0">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
        <span style="font-size:12px;font-weight:600;color:#1d1d1f">${count}</span>
        <span style="font-size:11px;color:#86868b;font-weight:500">${label}</span>
    </div>`;
    target.innerHTML = chip('Total', counts.total, '#1d1d1f') + chip('Published', counts.published, '#059669') + chip('Draft', counts.draft, '#6b7280') + chip('Archived', counts.archived, '#7c3aed');
}

// ── Confirm Unpublish ──
function confirmUnpublish(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    showModal(`
        <div style="text-align:center;padding:1rem 0">
            <div style="width:56px;height:56px;border-radius:16px;background:#fff7ed;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="ph ph-warning-circle" style="font-size:28px;color:#d97706"></i></div>
            <h3 style="font-size:1.1rem;font-weight:700;margin:0 0 8px">Unpublish "${esc(p.name)}"?</h3>
            <p style="font-size:13px;color:#86868b;margin:0 0 24px;line-height:1.6">This product will be removed from the storefront immediately. You can republish it anytime.</p>
            <div style="display:flex;gap:10px;justify-content:center">
                <button onclick="closeModal()" class="btn-secondary">Cancel</button>
                <button onclick="doUnpublish('${p.id}')" class="btn-primary" style="background:#d97706"><i class="ph ph-arrow-line-down"></i> Unpublish</button>
            </div>
        </div>`);
}

// ── Compatibility conflict guard (CR1.7) ──
// Strip hwId from every referencing SW product, logging one entry per affected SW.
function removeCompatRefs(hwId) {
    const hw = PRODUCTS.find(x => x.id === hwId);
    findCompatRefs(hwId).forEach(sw => {
        sw.compatible_hardware = (sw.compatible_hardware || []).filter(id => id !== hwId);
        sw.updated_at = new Date().toISOString().slice(0, 10);
        logActivity('Compatibility removed', sw.name, `${hw ? hw.name : hwId} removed from compatible hardware`, sw.id);
    });
}

// Confirm modal shown before unpublish/archive/delete of a HW product that SW products reference.
// confirmJs is the inline onclick that re-invokes the original action with force=true.
function showHwCompatConflictModal(pid, actionLabel, confirmJs) {
    const p = PRODUCTS.find(x => x.id === pid);
    const refNames = findCompatRefs(pid).map(sw => sw.name);
    showModal(`
        <div style="text-align:center;padding:1rem 0">
            <div style="width:56px;height:56px;border-radius:16px;background:#fff7ed;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="ph ph-warning-circle" style="font-size:28px;color:#d97706"></i></div>
            <h3 style="font-size:1.1rem;font-weight:700;margin:0 0 8px">${esc(actionLabel)} "${esc(p?.name || '')}"?</h3>
            <p style="font-size:13px;color:#86868b;margin:0 0 12px;line-height:1.6">This hardware is referenced as compatible hardware by:</p>
            <div style="font-size:13px;font-weight:600;color:#1d1d1f;margin:0 0 12px;line-height:1.8">${refNames.map(n => esc(n)).join('<br>')}</div>
            <p style="font-size:13px;color:#86868b;margin:0 0 24px;line-height:1.6">Proceeding will remove it from those products.</p>
            <div style="display:flex;gap:10px;justify-content:center">
                <button onclick="closeModal()" class="btn-secondary">Cancel</button>
                <button onclick="${confirmJs}" class="btn-primary" style="background:#d97706"><i class="ph ph-warning-circle"></i> ${esc(actionLabel)} Anyway</button>
            </div>
        </div>`);
}

function doUnpublish(pid, force = false) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    if (p.product_type === 'hardware' && findCompatRefs(pid).length) {
        if (!force) { showHwCompatConflictModal(pid, 'Unpublish', `doUnpublish('${pid}', true)`); return; }
        removeCompatRefs(pid);
    }
    p.status = 'draft';
    p.updated_at = new Date().toISOString().slice(0, 10);
    logActivity('Unpublished', p.name, 'Removed from storefront — back to Draft');
    closeModal();
    showToast(`${p.name} has been unpublished`, 'info');
    reRenderCurrentList();
    const detailView = document.getElementById(`view-${p.product_type === 'software' ? 'sw' : 'hw'}-detail`);
    if (detailView && !detailView.classList.contains('hidden')) {
        if (p.product_type === 'software') showSwDetail(pid);
        else showHwDetail(pid);
    }
}

// ── Archive ──
function archiveProduct(pid, force = false) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    if (p.product_type === 'hardware' && findCompatRefs(pid).length) {
        if (!force) { showHwCompatConflictModal(pid, 'Archive', `closeModal();archiveProduct('${pid}', true)`); return; }
        removeCompatRefs(pid);
    }
    const prevLabel = p.status === 'published' ? 'Published' : 'Draft';
    p.status = 'archived';
    p.updated_at = new Date().toISOString().slice(0, 10);
    logActivity('Archived', p.name, `Archived from ${prevLabel}`);
    showToast(`${p.name} has been archived.`, 'success');
    reRenderCurrentList();
}

function restoreProduct(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    p.status = 'draft';
    p.updated_at = new Date().toISOString().slice(0, 10);
    logActivity('Restored', p.name, 'Restored to Draft');
    showToast(`${p.name} has been restored as a draft.`, 'success');
    reRenderCurrentList();
}

// ── Delete (permanent) ──
function confirmDeleteProduct(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    showModal(`
        <div style="text-align:center;padding:1rem 0">
            <div style="width:56px;height:56px;border-radius:16px;background:#fef2f2;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="ph ph-trash" style="font-size:28px;color:#dc2626"></i></div>
            <h3 style="font-size:1.1rem;font-weight:700;margin:0 0 8px">Permanently delete "${esc(p.name)}"?</h3>
            <p style="font-size:13px;color:#86868b;margin:0 0 16px;line-height:1.6">This action cannot be undone. Type the product name to confirm.</p>
            <input id="delete-confirm-input" type="text" class="input-field" style="max-width:320px;margin:0 auto 20px;text-align:center" placeholder="${esc(p.name)}">
            <div style="display:flex;gap:10px;justify-content:center">
                <button onclick="closeModal()" class="btn-secondary">Cancel</button>
                <button onclick="doDeleteProduct('${p.id}')" class="btn-primary" style="background:#dc2626"><i class="ph ph-trash"></i> Delete Forever</button>
            </div>
        </div>`);
}

function doDeleteProduct(pid, force = false) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    if (!force) {
        const confirmVal = (document.getElementById('delete-confirm-input')?.value || '').trim();
        if (confirmVal !== p.name) { showToast('Product name does not match', 'error'); return; }
    }
    if (p.product_type === 'hardware' && findCompatRefs(pid).length) {
        if (!force) { showHwCompatConflictModal(pid, 'Delete', `doDeleteProduct('${pid}', true)`); return; }
        removeCompatRefs(pid);
    }
    const name = p.name;
    PRODUCTS.splice(PRODUCTS.indexOf(p), 1);
    logActivity('Deleted', name, 'Product permanently removed');
    closeModal();
    showToast(`${name} has been permanently deleted.`, 'success');
    reRenderCurrentList();
}

function reRenderCurrentList() {
    if (currentView === 'sw-products') renderSwProducts();
    else if (currentView === 'hw-products') renderHwProducts();
    else if (currentView === 'param-center') renderParamCenter();
}

// ═══════════════════════════════════════════════════════════════════
// HARDWARE PRODUCT LIST
// ═══════════════════════════════════════════════════════════════════

function renderHwProducts() {
    const all = getAllProducts('hardware');
    const searchQ = (document.getElementById('hw-search')?.value || '').toLowerCase();
    const filterS = document.getElementById('hw-filter-status')?.value || '';
    let list = all.filter(p => {
        if (!filterS && p.status === 'archived') return false;
        if (filterS && p.status !== filterS) return false;
        if (searchQ && !p.name.toLowerCase().includes(searchQ) && !p.vendor_name.toLowerCase().includes(searchQ) && !(p.model || '').toLowerCase().includes(searchQ)) return false;
        return true;
    });
    list = applySorting(list, 'hardware');
    renderStatsBar('hw-stats-bar', all);
    const page = paginateProductList(list, 'hardware');

    document.getElementById('hw-products-tbody').innerHTML = list.length ? page.items.map(p => `
        <tr class="cursor-pointer" onclick="if(!event.target.closest('button'))showHwDetail('${p.id}')">
            <td>
                <div style="font-weight:600;font-size:13.5px;color:#1d1d1f">${esc(p.name)}</div>
                ${(p.product_format || 'standard') === 'standard' ? `<div style="font-size:12px;color:#86868b;margin-top:1px">${esc([p.brand, p.model].filter(Boolean).join(' · '))}</div>` : ''}
            </td>
            <td><span style="color:#86868b;font-size:13px">${esc(p.vendor_name || '—')}</span></td>
            <td><span class="badge badge-zinc">${esc(p.sub_category || 'Hardware')}</span></td>
            <td><span class="format-badge ${(p.product_format || 'standard') === 'standard' ? 'is-standard' : 'is-nonstandard'}" style="font-size:11px"><i class="ph ${(p.product_format || 'standard') === 'standard' ? 'ph-list-bullets' : 'ph-cube'}"></i> ${(p.product_format || 'standard') === 'standard' ? 'Standard' : 'Non-standard'}</span></td>
            <td>${p.is_aidaptiv ? '<span class="badge badge-green">aiDAPTIV</span>' : '<span style="font-size:12px;color:#c7c7cc">—</span>'}</td>
            <td>${statusBadge(p.status)}</td>
            <td class="text-right" onclick="event.stopPropagation()">
                <div class="flex items-center gap-0.5 justify-end">
                    ${p.status !== 'archived' ? `<button onclick="showEditProductModal('${p.id}', 'list')" class="btn-ghost" title="Edit"><i class="ph ph-pencil-simple"></i></button>` : ''}
                    ${productActionBtns(p)}
                </div>
            </td>
        </tr>
    `).join('') : `<tr><td colspan="7" class="text-center py-16">${emptyState(
        'ph-hard-drives',
        searchQ ? EMPTY_STATE_NO_RESULTS : EMPTY_STATE_NO_DATA,
        !searchQ && !filterS ? '<button onclick="showCreateProductModal(\'hardware\')" class="btn-primary text-xs mt-1"><i class="ph ph-plus-circle"></i> Add Hardware</button>' : ''
    )}</td></tr>`;
    renderProductPagination('hardware', list.length, page.currentPage, page.totalPages);
}

// ═══════════════════════════════════════════════════════════════════
// PUBLISH / UNPUBLISH (simplified toggle)
// ═══════════════════════════════════════════════════════════════════

function togglePublish(pid, force = false) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p || !canManageProduct(p)) return;

    if (p.status === 'published') {
        if (p.product_type === 'hardware' && findCompatRefs(pid).length) {
            if (!force) { showHwCompatConflictModal(pid, 'Unpublish', `closeModal();togglePublish('${pid}', true)`); return; }
            removeCompatRefs(pid);
        }
        p.status = 'draft';
        p.updated_at = new Date().toISOString().slice(0, 10);
        logActivity('Unpublished', p.name, 'Removed from storefront — back to Draft');
        showToast(`${p.name} has been unpublished`, 'info');
    } else {
        if (p.product_type === 'software') {
            const staleIds = (p.compatible_hardware || []).filter(hid => {
                const hw = PRODUCTS.find(x => x.id === hid);
                return !hw || hw.status !== 'published';
            });
            if (staleIds.length) {
                // Hard invariant: a SW can only reference published HW (enforced by the published-only
                // picker + ref-stripping on every HW takedown). Unreachable in normal flow — drop
                // silently as a data-integrity backstop, no prompt.
                const staleNames = staleIds.map(hid => PRODUCTS.find(x => x.id === hid)?.name || hid);
                p.compatible_hardware = p.compatible_hardware.filter(hid => !staleIds.includes(hid));
                logActivity('Compatibility removed', p.name, `not-published hardware removed on publish: ${staleNames.join(', ')}`, p.id);
            }
        }
        p.status = 'published';
        p.updated_at = new Date().toISOString().slice(0, 10);
        logActivity('Published', p.name, 'Listed on storefront');
        showToast(`${p.name} is now published!`, 'success');
    }
    reRenderCurrentList();
}

// ═══════════════════════════════════════════════════════════════════
// HARDWARE PREVIEW (storefront card modal)
// ═══════════════════════════════════════════════════════════════════

function showHwPreview(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    const fmt = p.product_format || 'standard';
    const specs = p.key_specifications || [];
    const platforms = p.ns_platforms || [];
    const isAidaptiv = p.is_aidaptiv;

    let specSections = '';
    if (fmt === 'nonstandard') {
        if (platforms.length) specSections += `<div class="preview-section"><div class="preview-section-title"><i class="ph ph-cpu" style="color:#7c8ec8"></i> Processor / Platform</div><ul class="hw-spec-list">${platforms.map(s => '<li><span>' + esc(s) + '</span></li>').join('')}</ul></div>`;
        if (specs.length) specSections += `<div class="preview-section"><div class="preview-section-title"><i class="ph ph-sliders-horizontal" style="color:#7c8ec8"></i> Key Specifications</div><ul class="hw-spec-list">${specs.map(s => '<li><span>' + esc(s) + '</span></li>').join('')}</ul></div>`;
    } else {
        if (specs.length) specSections += `<div class="preview-section"><div class="preview-section-title"><i class="ph ph-sliders-horizontal" style="color:#7c8ec8"></i> Key Specifications</div><ul class="hw-spec-list">${specs.map(s => '<li><span>' + esc(s) + '</span></li>').join('')}</ul></div>`;
    }

    ensurePreviewDrawer();
    sdDrawer.innerHTML = `
        <button class="sd-close" type="button" onclick="closeSwPreview()" aria-label="Close preview">&times;</button>
        <div class="sd-body" style="padding:28px 24px 36px">
            <div style="text-align:center;margin-bottom:20px">
                <div style="display:inline-flex;align-items:center;gap:8px">
                    <span class="format-badge ${fmt === 'standard' ? 'is-standard' : 'is-nonstandard'}"><i class="ph ${fmt === 'standard' ? 'ph-list-bullets' : 'ph-cube'}"></i> ${fmt === 'standard' ? 'Standard' : 'Non-standard'}</span>
                    <span style="font-size:12px;color:#86868b;font-weight:500">Storefront Preview</span>
                </div>
            </div>
            <div class="hw-preview-card" style="max-width:380px;margin:0 auto">
                <div class="hw-preview-media">
                    ${p.image_data ? `<img src="${p.image_data}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:cover">` : `<div class="hw-placeholder-icon" aria-hidden="true">
                        <div class="hw-placeholder-device"></div>
                        <div class="hw-placeholder-device"></div>
                    </div>`}
                </div>
                <div class="hw-preview-body">
                    <h4 class="hw-preview-title">${esc(p.name)}</h4>
                    <div class="hw-preview-category">${esc(p.sub_category || '')}</div>
                    <hr class="hw-preview-divider">
                    ${specSections || '<div style="padding:10px 14px;color:#6d7695;font-size:0.82rem;font-style:italic">No specifications</div>'}
                    ${isAidaptiv ? `<div class="hw-aidaptiv-row">
                        <img src="images/logo-aidaptiv-plus.png" alt="aiDAPTIV" class="hw-aidaptiv-logo" onerror="this.outerHTML='<span style=&quot;font-size:1rem;font-weight:900;color:#1d1d1f&quot;>aiDAPTIV</span>'">
                        <span class="hw-aidaptiv-link">What is aiDaptiv?</span>
                    </div>` : ''}
                    <button type="button" class="hw-preview-cta">Select Hardware</button>
                </div>
            </div>
        </div>`;

    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        sdBackdrop.classList.add('is-open');
        sdDrawer.classList.add('is-open');
    });
}

// ═══════════════════════════════════════════════════════════════════
// SOFTWARE DETAIL
// ═══════════════════════════════════════════════════════════════════

function showSwDetail(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    const compatHW = (p.compatible_hardware || []).map(hid => PRODUCTS.find(x => x.id === hid)).filter(Boolean);
    const canEdit = canManageProduct(p);

    const detailRow = (label, value) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-light)"><span style="color:#86868b;font-size:13px">${label}</span><span style="font-weight:600;font-size:13px">${value}</span></div>`;

    document.getElementById('sw-detail-content').innerHTML = `
        <button onclick="navigate('sw-products')" style="display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#86868b;font-weight:500;margin-bottom:24px;background:none;border:none;cursor:pointer"><i class="ph ph-arrow-left"></i> Back to Software</button>

        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px">
            <div style="display:flex;align-items:center;gap:16px">
                ${p.icon_data ? `<img src="${p.icon_data}" alt="${esc(p.name)}" style="width:48px;height:48px;border-radius:14px;object-fit:cover;flex-shrink:0">` : `<div style="width:48px;height:48px;border-radius:14px;background:#f5f5f7;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#86868b">${esc(p.name.slice(0,2).toUpperCase())}</div>`}
                <div>
                    <div style="display:flex;align-items:center;gap:10px">
                        <h2 style="font-size:1.4rem;font-weight:700;letter-spacing:-0.03em;margin:0">${esc(p.name)}</h2>
                        ${statusBadge(p.status)}
                    </div>
                    <div style="font-size:13px;color:#86868b;margin-top:3px">${esc(p.vendor_name)} · ${esc(getSwCategories(p).join(', '))}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                ${canEdit && p.status !== 'archived' ? `<button onclick="showEditProductModal('${p.id}', 'detail')" class="btn-secondary"><i class="ph ph-pencil-simple"></i> Edit</button>` : ''}
                ${canEdit && p.status === 'published' ? `<button onclick="confirmUnpublish('${p.id}')" class="btn-secondary" style="color:#d97706"><i class="ph ph-arrow-down"></i> Unpublish</button>` : ''}
                ${canEdit && p.status !== 'published' && p.status !== 'archived' ? `<button onclick="togglePublish('${p.id}');showSwDetail('${p.id}')" class="btn-primary"><i class="ph ph-arrow-up"></i> Publish</button>` : ''}
                ${canEdit && p.status !== 'archived' ? `<button onclick="archiveProduct('${p.id}');navigate('sw-products')" class="btn-secondary" style="color:#7c3aed"><i class="ph ph-archive"></i> Archive</button>` : ''}
                ${canEdit && p.status === 'archived' ? `<button onclick="restoreProduct('${p.id}');showSwDetail('${p.id}')" class="btn-primary" style="background:#059669"><i class="ph ph-arrow-counter-clockwise"></i> Restore</button>` : ''}
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:48px">
            <!-- Left Column -->
            <div>
                <!-- Key Features -->
                ${p.features?.length ? `
                <section style="margin-top:32px;margin-bottom:32px">
                    <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px">Key Features</div>
                    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px">${p.features.map(f => `<li style="display:flex;align-items:flex-start;gap:10px;font-size:14px;color:#1d1d1f"><span style="width:5px;height:5px;border-radius:50%;background:#1d1d1f;flex-shrink:0;margin-top:8px"></span><span>${esc(f)}</span></li>`).join('')}</ul>
                </section>
                <div style="border-top:1px solid var(--border-light)"></div>` : ''}

                <!-- Industries -->
                ${p.industries?.length ? `
                <section style="margin-top:32px">
                    <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px">Applicable Industries</div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">${p.industries.map(i => `<span class="badge badge-zinc">${esc(i)}</span>`).join('')}</div>
                </section>` : ''}
            </div>

            <!-- Right Column -->
            <div>
                <!-- Product Info -->
                <section style="margin-bottom:32px">
                    <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Product Info</div>
                    ${detailRow('Brand', esc(p.brand))}
                    ${detailRow('Category', esc(getSwCategories(p).join(', ')))}
                    ${detailRow('Created', esc(p.created_at))}
                    ${detailRow('Updated', esc(p.updated_at))}
                </section>
                <div style="border-top:1px solid var(--border-light)"></div>

                <!-- Compatible Hardware -->
                <section style="margin-top:32px;margin-bottom:32px">
                    <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px">Compatible Hardware</div>
                    ${compatHW.length ? `<div style="display:flex;flex-direction:column;gap:10px">${compatHW.map(h => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#1d1d1f"><i class="ph ph-hard-drives" style="color:#86868b"></i><span style="font-weight:500">${esc(h.name)}</span></div>`).join('')}</div>` : '<div style="font-size:13px;color:#c7c7cc">No hardware selected</div>'}
                </section>
            </div>
        </div>
        ${renderProductHistory(p)}
    `;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-sw-detail').classList.remove('hidden');
    setPageHeader('', '', '');
}

// ═══════════════════════════════════════════════════════════════════
// HARDWARE DETAIL
// ═══════════════════════════════════════════════════════════════════

function showHwDetail(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    const canEdit = canManageProduct(p);

    const detailRow = (label, value) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-light)"><span style="color:#86868b;font-size:13px">${label}</span><span style="font-weight:600;font-size:13px">${value}</span></div>`;

    document.getElementById('hw-detail-content').innerHTML = `
        <button onclick="navigate('hw-products')" style="display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#86868b;font-weight:500;margin-bottom:24px;background:none;border:none;cursor:pointer"><i class="ph ph-arrow-left"></i> Back to Hardware</button>

        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px">
            <div style="display:flex;align-items:center;gap:16px">
                <div>
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                        <h2 style="font-size:1.4rem;font-weight:700;letter-spacing:-0.03em;margin:0">${esc(p.name)}</h2>
                        ${statusBadge(p.status)}
                        <span class="format-badge ${(p.product_format||'standard') === 'standard' ? 'is-standard' : 'is-nonstandard'}"><i class="ph ${(p.product_format||'standard') === 'standard' ? 'ph-list-bullets' : 'ph-cube'}"></i> ${(p.product_format||'standard') === 'standard' ? 'Standard' : 'Non-standard'}</span>
                        ${p.is_aidaptiv ? '<span class="badge badge-green">aiDAPTIV</span>' : ''}
                    </div>
                    <div style="font-size:13px;color:#86868b;margin-top:3px">${esc(p.vendor_name || '—')}${p.brand ? ' · ' + esc(p.brand) : ''}${p.model ? ' ' + esc(p.model) : ''}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                ${canEdit && p.status !== 'archived' ? `<button onclick="showEditProductModal('${p.id}', 'detail')" class="btn-secondary"><i class="ph ph-pencil-simple"></i> Edit</button>` : ''}
                ${canEdit && p.status === 'published' ? `<button onclick="confirmUnpublish('${p.id}')" class="btn-secondary" style="color:#d97706"><i class="ph ph-arrow-down"></i> Unpublish</button>` : ''}
                ${canEdit && p.status !== 'published' && p.status !== 'archived' ? `<button onclick="togglePublish('${p.id}');showHwDetail('${p.id}')" class="btn-primary"><i class="ph ph-arrow-up"></i> Publish</button>` : ''}
                ${canEdit && p.status !== 'archived' ? `<button onclick="archiveProduct('${p.id}');navigate('hw-products')" class="btn-secondary" style="color:#7c3aed"><i class="ph ph-archive"></i> Archive</button>` : ''}
                ${canEdit && p.status === 'archived' ? `<button onclick="restoreProduct('${p.id}');showHwDetail('${p.id}')" class="btn-primary" style="background:#059669"><i class="ph ph-arrow-counter-clockwise"></i> Restore</button>` : ''}
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:48px">
            <div>
                ${(p.product_format || 'standard') !== 'standard' && (p.ns_platforms || []).length ? `
                <div style="border-top:1px solid var(--border-light)"></div>
                <section style="margin-top:32px;margin-bottom:32px">
                    <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px">Processor / Platform</div>
                    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px">
                        ${(p.ns_platforms || []).map(s => '<li style="display:flex;align-items:flex-start;gap:10px;font-size:14px;color:#1d1d1f"><span style="width:5px;height:5px;border-radius:50%;background:#1d1d1f;flex-shrink:0;margin-top:8px"></span><span>' + esc(s) + '</span></li>').join('')}
                    </ul>
                </section>` : ''}

                ${(p.key_specifications || []).length ? `
                <div style="border-top:1px solid var(--border-light)"></div>
                <section style="margin-top:32px;margin-bottom:32px">
                    <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px">Key Specifications</div>
                    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px">
                        ${(p.key_specifications || []).map(s => '<li style="display:flex;align-items:flex-start;gap:10px;font-size:14px;color:#1d1d1f"><span style="width:5px;height:5px;border-radius:50%;background:#1d1d1f;flex-shrink:0;margin-top:8px"></span><span>' + esc(s) + '</span></li>').join('')}
                    </ul>
                </section>` : ''}

            </div>

            <div>
                <section>
                    <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Product Info</div>
                    ${detailRow('Format', '<span class="format-badge ' + ((p.product_format||'standard') === 'standard' ? 'is-standard' : 'is-nonstandard') + '"><i class="ph ' + ((p.product_format||'standard') === 'standard' ? 'ph-list-bullets' : 'ph-cube') + '"></i> ' + ((p.product_format||'standard') === 'standard' ? 'Standard' : 'Non-standard') + '</span>')}
                    ${(p.product_format || 'standard') === 'standard' ? detailRow('Brand', esc(p.brand)) : ''}
                    ${(p.product_format || 'standard') === 'standard' ? detailRow('Model', esc(p.model)) : ''}
                    ${detailRow('Category', esc(p.sub_category))}
                    ${detailRow('aiDAPTIV', p.is_aidaptiv ? '<span class="badge badge-green">Yes</span>' : 'No')}
                    ${detailRow('Created', esc(p.created_at))}
                    ${detailRow('Updated', esc(p.updated_at))}
                </section>
            </div>
        </div>
        ${renderProductHistory(p)}
    `;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-hw-detail').classList.remove('hidden');
    setPageHeader('', '', '');
}

// ═══════════════════════════════════════════════════════════════════
// SOFTWARE PREVIEW (front-end card preview)
// ═══════════════════════════════════════════════════════════════════

// ── Software Preview Drawer (v5 aligned) ──
let sdBackdrop = null, sdDrawer = null;

function ensurePreviewDrawer() {
    if (sdBackdrop && sdDrawer) return;
    sdBackdrop = document.createElement('div');
    sdBackdrop.className = 'sd-backdrop';
    sdBackdrop.setAttribute('aria-hidden', 'true');
    sdBackdrop.addEventListener('click', closeSwPreview);
    sdDrawer = document.createElement('div');
    sdDrawer.className = 'sd-drawer';
    sdDrawer.setAttribute('role', 'dialog');
    sdDrawer.setAttribute('aria-modal', 'true');
    sdDrawer.setAttribute('aria-label', 'Software detail preview');
    document.body.appendChild(sdBackdrop);
    document.body.appendChild(sdDrawer);
}

function showSwPreview(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    ensurePreviewDrawer();
    const compatHW = (p.compatible_hardware || []).map(hid => PRODUCTS.find(x => x.id === hid)).filter(Boolean);
    const initials = p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const SVG_FEATURES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:#7c8ec8;flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    const SVG_INDUSTRIES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:#7c8ec8;flex-shrink:0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';

    const featuresHtml = p.features?.length ? `
        <section class="sd-meta-block">
            <div class="sd-meta-title">${SVG_FEATURES} Key Features</div>
            <ul class="sd-feature-list">${p.features.map(f =>
                `<li class="sd-feature-item"><span class="sd-feature-dot"></span><span>${esc(f)}</span></li>`
            ).join('')}</ul>
        </section>` : '';

    const industriesHtml = p.industries?.length ? `
        <section class="sd-meta-block">
            <div class="sd-meta-title">${SVG_INDUSTRIES} Applicable Industries</div>
            <div class="sd-industry-list">${p.industries.map(i =>
                `<span class="sd-industry-chip">${esc(i)}</span>`
            ).join('')}</div>
        </section>` : '';

    const savedPhotos = (p.photos_data || []).filter(Boolean);
    savedSwGallery = { photos: savedPhotos, index: 0 };
    const galleryHtml = savedPhotos.length ? `
        <div>
            <div class="sd-gallery">
                <img class="sd-gallery-img" id="sd-saved-gallery-img" src="${savedPhotos[0]}" alt="${esc(p.name)}">
                ${savedPhotos.length > 1 ? `<span class="sd-gallery-nav prev" onclick="slideSavedSwGallery(-1)"><i class="ph ph-caret-left"></i></span>
                <span class="sd-gallery-nav next" onclick="slideSavedSwGallery(1)"><i class="ph ph-caret-right"></i></span>` : ''}
            </div>
            ${savedPhotos.length > 1 ? `<div class="sd-gallery-dots" id="sd-saved-gallery-dots">${savedPhotos.map((_, i) => `<span class="sd-gallery-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>` : ''}
        </div>` : '';

    const isBundled = p.sw_category === 'included';
    let actionHtml;
    if (isBundled) {
        actionHtml = `
            <button class="sd-action-primary" style="background:rgba(20,46,123,0.08);color:#1d2e7b;box-shadow:none;font-weight:700">Included</button>
            <p class="sd-action-helper">This software is bundled automatically with compatible hardware.</p>`;
    } else {
        actionHtml = `
            <button class="sd-action-primary">Select Add-on</button>
            <span class="sd-quote-link">Request a custom quote for this add-on</span>`;
    }

    sdDrawer.innerHTML = `
        <button class="sd-close" type="button" onclick="closeSwPreview()" aria-label="Close preview">&times;</button>
        <div class="sd-body">
            <div class="sd-hero">
                <div class="sd-hero-header">
                    <div class="sd-mark">${p.icon_data ? `<img src="${p.icon_data}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:20px">` : esc(initials)}</div>
                    <div>
                        <p class="sd-company">${esc(p.vendor_name)}</p>
                        <h2 class="sd-name">${esc(p.name)}</h2>
                    </div>
                </div>
                <p class="sd-tagline">${esc(p.tagline || getSwCategories(p).join(', '))}</p>
            </div>
            <div class="sd-content">
                ${featuresHtml}
                ${galleryHtml}
                ${industriesHtml}
            </div>
        </div>
        <div class="sd-action-footer">
            ${actionHtml}
        </div>`;

    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        sdBackdrop.classList.add('is-open');
        sdDrawer.classList.add('is-open');
    });
}

let savedSwGallery = { photos: [], index: 0 };

function slideSavedSwGallery(dir) {
    const total = savedSwGallery.photos.length;
    if (total <= 1) return;
    savedSwGallery.index = (savedSwGallery.index + dir + total) % total;
    const img = document.getElementById('sd-saved-gallery-img');
    if (img) img.src = savedSwGallery.photos[savedSwGallery.index];
    document.querySelectorAll('#sd-saved-gallery-dots .sd-gallery-dot').forEach((d, i) => d.classList.toggle('active', i === savedSwGallery.index));
}

function closeSwPreview() {
    if (!sdBackdrop || !sdDrawer) return;
    sdBackdrop.classList.remove('is-open');
    sdDrawer.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { if (sdDrawer) sdDrawer.innerHTML = ''; }, 340);
}

// ═══════════════════════════════════════════════════════════════════
// CREATE / EDIT PRODUCT MODAL
// ═══════════════════════════════════════════════════════════════════

function createField(id, label, opts = {}) {
    const required = opts.required ? ' <span class="req">*</span>' : '';
    const max = opts.maxlength ? ` maxlength="${opts.maxlength}"` : '';
    const placeholder = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : '';
    const type = opts.type || 'text';
    const value = opts.value ? ` value="${esc(opts.value)}"` : '';
    const input = opts.maxlength
        ? `<div class="relative">
            <input id="${id}" type="${type}" class="input-field pr-14" ${opts.required ? 'required' : ''}${max}${placeholder}${value} oninput="updateCharCounter('${id}')">
            <span id="${id}-count" class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#86868b] pointer-events-none">${(opts.value || '').length}/${opts.maxlength}</span>
        </div>`
        : `<input id="${id}" type="${type}" class="input-field" ${opts.required ? 'required' : ''}${max}${placeholder}${value}>`;
    return `<div class="${opts.wrapClass || ''}">
        <label for="${id}" class="field-label">${label}${required}</label>
        ${input}
        ${opts.hint ? `<div class="field-hint">${esc(opts.hint)}</div>` : ''}
        <div id="${id}-error" class="field-error-text"></div>
    </div>`;
}

function createTextArea(id, label, opts = {}) {
    const required = opts.required ? ' <span class="req">*</span>' : '';
    const max = opts.maxlength ? ` maxlength="${opts.maxlength}"` : '';
    const placeholder = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : '';
    const oninput = opts.maxlength ? ` oninput="updateCharCounter('${id}')"` : '';
    return `<div class="${opts.wrapClass || ''}">
        <label for="${id}" class="field-label">${label}${required}</label>
        <textarea id="${id}" rows="${opts.rows || 3}" class="input-field" ${opts.required ? 'required' : ''}${max}${placeholder}${oninput}></textarea>
        ${opts.maxlength ? `<div id="${id}-count" class="field-hint" style="text-align:right">0/${opts.maxlength}</div>` : ''}
        ${opts.hint ? `<div class="field-hint">${esc(opts.hint)}</div>` : ''}
        <div id="${id}-error" class="field-error-text"></div>
    </div>`;
}

function createFormSection(icon, title, subtitle, body) {
    return `<section class="form-section">
        <div class="form-section-head">
            <div>
                <div class="form-section-title"><i class="ph ${esc(icon)}"></i><span>${esc(title)}</span></div>
                ${subtitle ? `<div class="form-section-subtitle">${esc(subtitle)}</div>` : ''}
            </div>
        </div>
        <div class="form-section-body">${body}</div>
    </section>`;
}

function setCreateError(id, message = '') {
    const el = document.getElementById(id);
    const err = document.getElementById(`${id}-error`);
    if (el) el.classList.toggle('field-error', !!message);
    if (el?.type === 'file') el.closest('.file-upload-wrap')?.classList.toggle('field-error', !!message);
    if (err) err.textContent = message;
}

function valueOf(id) {
    return document.getElementById(id)?.value?.trim() || '';
}

function validateProductImageFiles(files, { currentCount = 0, maxCount = null, required = false } = {}) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) {
        return required
            ? { valid: false, code: 'required', message: PRODUCT_IMAGE_VALIDATION_MESSAGES.required }
            : { valid: true, code: null, message: '' };
    }

    const invalidFormatFile = selectedFiles.find(file => {
        const nameOk = /\.(jpe?g|png)$/i.test(file.name || '');
        const typeOk = !file.type || ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type);
        return !nameOk || !typeOk;
    });
    if (invalidFormatFile) {
        return { valid: false, code: 'format', message: PRODUCT_IMAGE_VALIDATION_MESSAGES.file, file: invalidFormatFile };
    }

    const oversizedFile = selectedFiles.find(file => Number(file.size || 0) > PRODUCT_IMAGE_MAX_BYTES);
    if (oversizedFile) {
        return { valid: false, code: 'size', message: PRODUCT_IMAGE_VALIDATION_MESSAGES.file, file: oversizedFile };
    }

    if (maxCount !== null && currentCount + selectedFiles.length > maxCount) {
        return { valid: false, code: 'count', message: PRODUCT_IMAGE_VALIDATION_MESSAGES.count };
    }

    return { valid: true, code: null, message: '' };
}

function setProductImageValidationError(id, validation) {
    const fileName = validation.file?.name;
    const message = fileName ? `${fileName}: ${validation.message}` : validation.message;
    if (validation.code === 'count') {
        setCreateError(id, '');
        showToast(message, 'error');
        return;
    }
    setCreateError(id, message);
}

function getMatchingVendorId(vendorName, vendorType) {
    // Vendor is a free-text field. Link to an existing org only on an exact
    // name match; otherwise leave vendor_id null (vendor_name is the source of truth).
    const target = String(vendorName || '').trim().toLowerCase();
    const org = ORGS.find(o => o.type === 'vendor' && o.vendor_type === vendorType && o.name.toLowerCase() === target);
    return org ? org.id : null;
}

function renderSoftwareFeatureInputs() {
    return Array.from({ length: SOFTWARE_FEATURE_MAX_ITEMS }, (_, i) => `
        <div class="relative">
            <input id="new-p-feature-${i}" class="input-field pr-16" maxlength="${SOFTWARE_FEATURE_MAX_CHARS}" placeholder="Feature ${i + 1}">
            <span id="new-p-feature-${i}-count" class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#86868b]">0/${SOFTWARE_FEATURE_MAX_CHARS}</span>
        </div>`).join('');
}

function collectHardwareSpecs() {
    return collectNsItems('new-p-spec');
}

// Standard Key Specs use the same dynamic Add-button machinery as non-standard,
// but count only their own single list (not a combined Platform+Spec total).
function updateSpecCounter() {
    const count = document.getElementById('new-p-spec-list')?.querySelectorAll('.ns-row').length || 0;
    const el = document.getElementById('spec-item-counter');
    if (el) {
        el.textContent = `${count} / ${HW_KEY_SPEC_MAX_ITEMS} items used`;
        el.style.color = count >= HW_KEY_SPEC_MAX_ITEMS ? '#ff3b30' : '#86868b';
    }
}

function addSpecRow() {
    const container = document.getElementById('new-p-spec-list');
    if (!container) return;
    const existing = container.querySelectorAll('.ns-row').length;
    if (existing >= HW_KEY_SPEC_MAX_ITEMS) { showToast('Max 8 items reached', 'error'); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = nsRowHtml(`new-p-spec-${existing}`, 'e.g. Intel Xeon 6730P 32 Core', '', 'updateSpecCounter()', 'renderHardwareCreatePreview()');
    container.appendChild(tmp.firstElementChild);
    updateSpecCounter();
}

function collectSoftwareFeatures() {
    return Array.from({ length: SOFTWARE_FEATURE_MAX_ITEMS }, (_, i) => valueOf(`new-p-feature-${i}`)).filter(Boolean);
}

function getCheckedValues(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)).map(el => el.value);
}

const SW_CATEGORY_MAX = 3;

function renderSwCategoryChecks(containerId, checkedValues = []) {
    const labels = SOFTWARE_CATEGORY_OPTIONS.filter(o => o.is_active).map(o => o.label);
    // Keep currently-assigned categories visible even if no longer an active option
    checkedValues.forEach(v => { if (!labels.includes(v)) labels.push(v); });
    return `<div id="${containerId}" class="flex flex-wrap gap-2">
        ${labels.map(l => `<label class="preview-pill cursor-pointer"><input type="checkbox" value="${esc(l)}" class="mr-2 accent-aiso" ${checkedValues.includes(l) ? 'checked' : ''} onchange="updateSwCategoryLimit('${containerId}')">${esc(l)}</label>`).join('')}
    </div>
    <div id="${containerId}-count" class="field-hint">${checkedValues.length}/${SW_CATEGORY_MAX} selected</div>
    <div id="${containerId}-error" class="field-error-text"></div>`;
}

function updateSwCategoryLimit(containerId) {
    const boxes = Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]`));
    const checked = boxes.filter(b => b.checked).length;
    boxes.forEach(b => { b.disabled = !b.checked && checked >= SW_CATEGORY_MAX; });
    const counter = document.getElementById(`${containerId}-count`);
    if (counter) counter.textContent = `${checked}/${SW_CATEGORY_MAX} selected`;
}

function updateCharCounter(inputId) {
    const el = document.getElementById(inputId);
    const counter = document.getElementById(`${inputId}-count`);
    if (el && counter) counter.textContent = `${el.value.length}/${el.maxLength}`;
}

// Non-standard rows get reindexed (ids change on row removal), so locate the
// counter as a sibling via class instead of by id.
function updateNsCharCount(el) {
    if (!el) return;
    const counter = el.parentElement.querySelector('.ns-char-count');
    if (counter) counter.textContent = `${el.value.length}/${el.maxLength}`;
}

// Markup for one non-standard Platform / Key Spec row, with a visible char counter.
function nsRowHtml(id, placeholder, value, onCounter, onPreview) {
    const v = value || '';
    return `<div class="ns-row flex items-center gap-2">
        <div class="relative flex-1">
            <input id="${id}" type="text" maxlength="${HW_KEY_SPEC_MAX_CHARS}" class="input-field pr-14 w-full" value="${esc(v)}" placeholder="${placeholder}" oninput="updateNsCharCount(this);${onCounter};${onPreview}">
            <span class="ns-char-count absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#86868b]">${v.length}/${HW_KEY_SPEC_MAX_CHARS}</span>
        </div>
        <button type="button" class="btn-ghost" style="padding:4px 6px;flex-shrink:0" onclick="this.closest('.ns-row').remove();reindexNsRows('${id.replace(/-\d+$/, '')}');${onCounter};${onPreview}"><i class="ph ph-x" style="font-size:12px"></i></button>
    </div>`;
}

function getProductInitials(name) {
    const text = String(name || '').trim();
    if (!text) return 'OE';
    return text.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function renderSortableProductImage(img, index, context) {
    const removeHandler = context === 'edit' ? `removeEditSwImage(${index})` : `removeSoftwareImage(${index})`;
    return `<div class="product-image-sort-item" draggable="true" title="Drag to reorder"
        ondragstart="onProductImageDragStart(event,'${context}',${index})"
        ondragover="onProductImageDragOver(event)"
        ondragleave="onProductImageDragLeave(event)"
        ondrop="onProductImageDrop(event,'${context}',${index})"
        ondragend="onProductImageDragEnd(event)">
        <i class="ph ph-dots-six-vertical product-image-sort-grip" aria-hidden="true"></i>
        <img class="product-image-sort-thumb" src="${esc(img.url)}" alt="" draggable="false">
        <span class="product-image-sort-name">${esc(img.name)}</span>
        ${index === 0 ? '<span class="product-image-primary-badge">Main</span>' : ''}
        <button type="button" class="product-image-sort-remove" aria-label="Remove ${esc(img.name)}" onclick="event.stopPropagation();${removeHandler}">
            <i class="ph ph-x"></i>
        </button>
    </div>`;
}

function renderImageStatus(type) {
    const target = document.getElementById(type === 'hardware' ? 'hardware-image-status' : 'software-image-status');
    if (!target) return;
    if (type === 'hardware') {
        const img = createProductState.hardwareImage;
        target.innerHTML = img ? `
            <div class="flex items-center justify-between gap-3 rounded-xl border border-[#e8eaed] bg-[#f5f5f7] px-3 py-2.5">
                <span class="image-chip"><i class="ph ph-image"></i><span class="truncate">${esc(img.name)}</span></span>
                <button type="button" class="btn-ghost py-1 px-2" onclick="removeHardwareImage()"><i class="ph ph-trash"></i> Delete</button>
            </div>` : '';
        return;
    }
    const imgs = createProductState.softwareImages;
    target.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] text-[#86868b] font-bold">${imgs.length}/${PRODUCT_IMAGE_MAX_COUNT} images</span>
            ${imgs.length ? '<button type="button" class="btn-ghost py-1 px-2" onclick="clearSoftwareImages()"><i class="ph ph-trash"></i> Delete all</button>' : ''}
        </div>
        <div class="product-image-sort-list">
            ${imgs.map((img, idx) => renderSortableProductImage(img, idx, 'create')).join('')}
        </div>
        ${imgs.length > 1 ? '<div class="product-image-sort-hint"><i class="ph ph-arrows-out-line-horizontal"></i> Drag images to reorder. The first image is the main image.</div>' : ''}`;
}

function handleHardwareImageUpload(input) {
    const file = input.files?.[0];
    setCreateError('new-p-image', '');
    if (!file) {
        createProductState.hardwareImage = null;
        renderImageStatus('hardware');
        renderCreateProductPreview('hardware');
        return;
    }
    const validation = validateProductImageFiles([file], { required: true });
    if (!validation.valid) {
        input.value = '';
        createProductState.hardwareImage = null;
        setProductImageValidationError('new-p-image', validation);
        renderImageStatus('hardware');
        renderCreateProductPreview('hardware');
        return;
    }
    createProductState.hardwareImage = { file, name: file.name, url: URL.createObjectURL(file) };
    const hwImgObj = createProductState.hardwareImage;
    Store.compressImage(file).then(d => { hwImgObj.dataUrl = d; }).catch(() => {});
    renderImageStatus('hardware');
    renderCreateProductPreview('hardware');
}

function removeHardwareImage() {
    createProductState.hardwareImage = null;
    const input = document.getElementById('new-p-image');
    if (input) input.value = '';
    renderImageStatus('hardware');
    renderCreateProductPreview('hardware');
}

function handleSoftwareIconUpload(input) {
    const file = input.files?.[0];
    setCreateError('new-p-icon', '');
    if (!file) {
        createProductState.softwareIcon = null;
        renderIconStatus();
        renderCreateProductPreview('software');
        return;
    }
    const validation = validateProductImageFiles([file], { required: true });
    if (!validation.valid) {
        input.value = '';
        createProductState.softwareIcon = null;
        setProductImageValidationError('new-p-icon', validation);
        renderIconStatus();
        renderCreateProductPreview('software');
        return;
    }
    createProductState.softwareIcon = { file, name: file.name, url: URL.createObjectURL(file) };
    const swIconObj = createProductState.softwareIcon;
    Store.compressImage(file).then(d => { swIconObj.dataUrl = d; }).catch(() => {});
    renderIconStatus();
    renderCreateProductPreview('software');
}

function removeSoftwareIcon() {
    createProductState.softwareIcon = null;
    const input = document.getElementById('new-p-icon');
    if (input) input.value = '';
    renderIconStatus();
    renderCreateProductPreview('software');
}

function renderIconStatus() {
    const target = document.getElementById('software-icon-status');
    if (!target) return;
    const icon = createProductState.softwareIcon;
    target.innerHTML = icon ? `
        <div class="flex items-center justify-between gap-3 rounded-xl border border-[#e8eaed] bg-[#f5f5f7] px-3 py-2.5">
            <span class="image-chip"><img src="${esc(icon.url)}" style="width:20px;height:20px;border-radius:5px;object-fit:cover"><span class="truncate">${esc(icon.name)}</span></span>
            <button type="button" class="btn-ghost py-1 px-2" onclick="removeSoftwareIcon()"><i class="ph ph-trash"></i> Remove</button>
        </div>` : '';
}

function handleSoftwareImageUpload(input) {
    const files = Array.from(input.files || []);
    setCreateError('new-p-images', '');
    if (!files.length) return;
    const validation = validateProductImageFiles(files, {
        currentCount: createProductState.softwareImages.length,
        maxCount: PRODUCT_IMAGE_MAX_COUNT,
    });
    if (!validation.valid) {
        input.value = '';
        setProductImageValidationError('new-p-images', validation);
        return;
    }
    createProductState.softwareImages.push(...files.map(file => {
        const obj = { file, name: file.name, url: URL.createObjectURL(file) };
        Store.compressImage(file).then(d => { obj.dataUrl = d; }).catch(() => {});
        return obj;
    }));
    input.value = '';
    renderImageStatus('software');
    renderCreateProductPreview('software');
}

function removeSoftwareImage(index) {
    createProductState.softwareImages.splice(index, 1);
    renderImageStatus('software');
    renderCreateProductPreview('software');
}

function clearSoftwareImages() {
    createProductState.softwareImages = [];
    renderImageStatus('software');
    renderCreateProductPreview('software');
}

let productImageDragContext = null;
let productImageDragIndex = null;

function onProductImageDragStart(e, context, index) {
    productImageDragContext = context;
    productImageDragIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', `${context}:${index}`); } catch (err) { /* ignore */ }
    e.currentTarget.classList.add('is-dragging');
}

function onProductImageDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function onProductImageDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function onProductImageDragEnd(e) {
    e.currentTarget.classList.remove('is-dragging');
    document.querySelectorAll('.product-image-sort-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    productImageDragContext = null;
    productImageDragIndex = null;
}

function onProductImageDrop(e, context, targetIndex) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const fromIndex = productImageDragIndex;
    if (productImageDragContext !== context || fromIndex === null || fromIndex === targetIndex) return;

    const images = context === 'edit' ? editSwImages : createProductState.softwareImages;
    if (fromIndex < 0 || fromIndex >= images.length || targetIndex < 0 || targetIndex >= images.length) return;
    const [moved] = images.splice(fromIndex, 1);
    images.splice(targetIndex, 0, moved);
    productImageDragContext = null;
    productImageDragIndex = null;
    previewGalleryIndex = 0;

    if (context === 'edit') {
        renderEditSwImageStatus();
        renderEditPreview('software');
    } else {
        renderImageStatus('software');
        renderCreateProductPreview('software');
    }
}

const HW_NS_MAX_ITEMS = 8; // Platform + Key Specs combined max

function getHwFormat() {
    return document.querySelector('input[name="hw-format"]:checked')?.value || 'standard';
}

function clearCreateProductValidation() {
    const form = document.getElementById('create-product-form');
    if (!form) return;
    form.querySelectorAll('.field-error-text').forEach(error => { error.textContent = ''; });
    form.querySelectorAll('.field-error').forEach(field => field.classList.remove('field-error'));
}

function switchHwFormat(fmt) {
    clearCreateProductValidation();
    document.querySelectorAll('#hw-format-selector label').forEach(l => l.classList.remove('is-active'));
    const radio = document.getElementById('hw-format-' + fmt);
    if (radio) { radio.checked = true; radio.nextElementSibling?.classList.add('is-active'); }
    const stdSection = document.getElementById('hw-standard-section');
    const nsSection = document.getElementById('hw-nonstandard-section');
    const vendorBlock = document.getElementById('new-p-vendor-block');
    if (fmt === 'nonstandard') {
        if (stdSection) stdSection.style.display = 'none';
        if (nsSection) nsSection.style.display = '';
        if (vendorBlock) vendorBlock.style.display = 'none';
    } else {
        if (stdSection) stdSection.style.display = '';
        if (nsSection) nsSection.style.display = 'none';
        if (vendorBlock) vendorBlock.style.display = '';
    }
    renderHardwareCreatePreview();
}

function getNsItemCount(prefix) {
    let count = 0;
    for (let i = 0; i < HW_NS_MAX_ITEMS; i++) {
        const el = document.getElementById(`${prefix}-${i}`);
        if (el && el.value.trim()) count++;
    }
    return count;
}

function updateNsCounter() {
    const pCount = getNsItemCount('new-p-platform');
    const sCount = getNsItemCount('new-p-nsspec');
    const total = pCount + sCount;
    const el = document.getElementById('ns-item-counter');
    if (el) {
        el.textContent = `${total} / ${HW_NS_MAX_ITEMS} items used`;
        el.style.color = total >= HW_NS_MAX_ITEMS ? '#ff3b30' : '#86868b';
    }
}

function addNsRow(section) {
    const prefix = section === 'platform' ? 'new-p-platform' : 'new-p-nsspec';
    const container = document.getElementById(prefix + '-list');
    if (!container) return;
    const totalRows = (document.getElementById('new-p-platform-list')?.querySelectorAll('.ns-row').length || 0)
                    + (document.getElementById('new-p-nsspec-list')?.querySelectorAll('.ns-row').length || 0);
    if (totalRows >= HW_NS_MAX_ITEMS) { showToast(`Combined max ${HW_NS_MAX_ITEMS} items reached`, 'error'); return; }
    const existing = container.querySelectorAll('.ns-row').length;
    const idx = existing;
    const ph = section === 'platform' ? 'NVIDIA RTX A6000' : 'Max. GPU x8';
    const tmp = document.createElement('div');
    tmp.innerHTML = nsRowHtml(`${prefix}-${idx}`, `e.g. ${ph}`, '', 'updateNsCounter()', 'renderHardwareCreatePreview()');
    container.appendChild(tmp.firstElementChild);
    updateNsCounter();
}

function reindexNsRows(prefix) {
    const container = document.getElementById(prefix + '-list');
    if (!container) return;
    container.querySelectorAll('.ns-row input').forEach((inp, i) => { inp.id = `${prefix}-${i}`; });
}

function collectNsItems(prefix) {
    const items = [];
    for (let i = 0; i < HW_NS_MAX_ITEMS; i++) {
        const el = document.getElementById(`${prefix}-${i}`);
        if (el && el.value.trim()) items.push(el.value.trim());
    }
    return items;
}

/* ── Edit modal non-standard helpers ── */
function addEditNsRow(section) {
    const prefix = section === 'platform' ? 'edit-p-platform' : 'edit-p-nsspec';
    const container = document.getElementById(prefix + '-list');
    if (!container) return;
    const totalRows = (document.getElementById('edit-p-platform-list')?.querySelectorAll('.ns-row').length || 0)
                    + (document.getElementById('edit-p-nsspec-list')?.querySelectorAll('.ns-row').length || 0);
    if (totalRows >= HW_NS_MAX_ITEMS) { showToast(`Combined max ${HW_NS_MAX_ITEMS} items reached`, 'error'); return; }
    const existing = container.querySelectorAll('.ns-row').length;
    const idx = existing;
    const ph = section === 'platform' ? 'NVIDIA RTX A6000' : 'Max. GPU x8';
    const tmp = document.createElement('div');
    tmp.innerHTML = nsRowHtml(`${prefix}-${idx}`, `e.g. ${ph}`, '', 'updateEditNsCounter()', "renderEditPreview('hardware')");
    container.appendChild(tmp.firstElementChild);
    updateEditNsCounter();
}

function updateEditNsCounter() {
    const pCount = getNsItemCount('edit-p-platform');
    const sCount = getNsItemCount('edit-p-nsspec');
    const total = pCount + sCount;
    const el = document.getElementById('edit-ns-item-counter');
    if (el) {
        el.textContent = `${total} / ${HW_NS_MAX_ITEMS} items used`;
        el.style.color = total >= HW_NS_MAX_ITEMS ? '#ff3b30' : '#86868b';
    }
}

/* ── Edit modal standard Key Specs (Add-button list, single list) ── */
function updateEditSpecCounter() {
    const count = document.getElementById('edit-p-spec-list')?.querySelectorAll('.ns-row').length || 0;
    const el = document.getElementById('edit-spec-item-counter');
    if (el) {
        el.textContent = `${count} / ${HW_KEY_SPEC_MAX_ITEMS} items used`;
        el.style.color = count >= HW_KEY_SPEC_MAX_ITEMS ? '#ff3b30' : '#86868b';
    }
}

function addEditSpecRow() {
    const container = document.getElementById('edit-p-spec-list');
    if (!container) return;
    const existing = container.querySelectorAll('.ns-row').length;
    if (existing >= HW_KEY_SPEC_MAX_ITEMS) { showToast('Max 8 items reached', 'error'); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = nsRowHtml(`edit-p-spec-${existing}`, 'e.g. Intel Xeon 6730P 32 Core', '', 'updateEditSpecCounter()', "renderEditPreview('hardware')");
    container.appendChild(tmp.firstElementChild);
    updateEditSpecCounter();
}

function renderHardwareCreatePreview() {
    const fmt = getHwFormat();
    const name = valueOf('new-p-name') || 'Product Name';
    const category = valueOf('new-p-product-type');
    const isAidaptiv = document.getElementById('new-p-aidaptiv')?.checked || false;
    const image = createProductState.hardwareImage;
    const target = document.getElementById('create-live-preview');
    if (!target) return;

    if (fmt === 'nonstandard') {
        const platforms = collectNsItems('new-p-platform');
        const nsSpecs = collectNsItems('new-p-nsspec');
        target.innerHTML = `
            <div class="preview-eyebrow"><span class="preview-eyebrow-left"><i class="ph ph-eye"></i> Live Preview</span><span class="format-badge is-nonstandard"><i class="ph ph-cube"></i> Non-standard</span></div>
            <div class="hw-preview-card">
                <div class="hw-preview-media">
                    ${image ? `<img src="${esc(image.url)}" alt="${esc(image.name)}">` : `<div class="hw-placeholder-icon" aria-hidden="true">
                        <div class="hw-placeholder-device"></div>
                        <div class="hw-placeholder-device"></div>
                        <div style="margin-top:10px;font-size:0.82rem;font-weight:500;color:#9aa6bf">Upload a product image</div>
                    </div>`}
                </div>
                <div class="hw-preview-body">
                    <h4 class="hw-preview-title">${esc(name)}</h4>
                    <div class="hw-preview-category">${esc(category || 'Product Type')}</div>
                    <hr class="hw-preview-divider">
                    ${platforms.length ? `<div class="preview-section">
                        <div class="preview-section-title"><i class="ph ph-cpu" style="color:#7c8ec8"></i> Processor / Platform</div>
                        <ul class="hw-spec-list">${platforms.map(s => '<li><span>' + esc(s) + '</span></li>').join('')}</ul>
                    </div>` : ''}
                    ${nsSpecs.length ? `<div class="preview-section">
                        <div class="preview-section-title"><i class="ph ph-sliders-horizontal" style="color:#7c8ec8"></i> Key Specifications</div>
                        <ul class="hw-spec-list">${nsSpecs.map(s => '<li><span>' + esc(s) + '</span></li>').join('')}</ul>
                    </div>` : ''}
                    ${!platforms.length && !nsSpecs.length ? '<div style="padding:10px 14px;color:#6d7695;font-size:0.82rem;font-style:italic">Add platform or spec items...</div>' : ''}
                    ${isAidaptiv ? `<div class="hw-aidaptiv-row">
                        <img src="images/logo-aidaptiv-plus.png" alt="aiDAPTIV" class="hw-aidaptiv-logo" onerror="this.outerHTML='<span style=&quot;font-size:1rem;font-weight:900;color:#1d1d1f&quot;>aiDAPTIV</span>'">
                        <span class="hw-aidaptiv-link">What is aiDaptiv?</span>
                    </div>` : ''}
                    <button type="button" class="hw-preview-cta">Select Hardware</button>
                </div>
            </div>
            <div style="margin-top:10px;text-align:center;font-size:0.62rem;color:#86868b;font-style:italic">Non-standard storefront card preview</div>`;
        return;
    }

    // Standard preview: structured spec card
    const specs = collectHardwareSpecs();
    const imagePrompt = name === 'Product Name'
        ? '[ Product image ]'
        : `[ Please place ${name}${category ? ' ' + category : ''} image here ]`;
    target.innerHTML = `
        <div class="preview-eyebrow"><span class="preview-eyebrow-left"><i class="ph ph-eye"></i> Live Preview</span><span class="format-badge is-standard"><i class="ph ph-list-bullets"></i> Standard</span></div>
        <div class="hw-preview-card">
            <div class="hw-preview-media">
                ${image ? `<img src="${esc(image.url)}" alt="${esc(image.name)}">` : `<div class="hw-placeholder-icon" aria-hidden="true">
                    <div class="hw-placeholder-device"></div>
                    <div class="hw-placeholder-device"></div>
                    <div style="margin-top:10px;font-size:0.88rem;font-weight:500;line-height:1.4">${esc(imagePrompt)}</div>
                </div>`}
            </div>
            <div class="hw-preview-body">
                <h4 class="hw-preview-title">${esc(name)}</h4>
                <div class="hw-preview-category">${esc(category || 'Product Type')}</div>
                <hr class="hw-preview-divider">
                <div class="preview-section">
                    <div class="preview-section-title"><i class="ph ph-sliders-horizontal" style="color:#7c8ec8"></i> Key Specifications</div>
                    ${specs.length ? `<ul class="hw-spec-list">${specs.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ul>` : '<div style="padding:10px 14px 12px;color:#6d7695;font-size:0.82rem;font-style:italic">Fill in key specifications...</div>'}
                </div>
                ${isAidaptiv ? `<div class="hw-aidaptiv-row">
                    <img src="images/logo-aidaptiv-plus.png" alt="aiDAPTIV" class="hw-aidaptiv-logo" onerror="this.outerHTML='<span style=&quot;font-size:1rem;font-weight:900;color:#1d1d1f&quot;>aiDAPTIV</span>'">
                    <span class="hw-aidaptiv-link">What is aiDaptiv?</span>
                </div>` : ''}
                <button type="button" class="hw-preview-cta">Select Hardware</button>
            </div>
        </div>
        <div style="margin-top:10px;text-align:center;font-size:0.62rem;color:#86868b;font-style:italic">Standard storefront card preview</div>`;
}

let previewGalleryIndex = 0;

function renderPreviewGallery(images, context = 'create') {
    if (!images || images.length === 0) {
        return `<div class="sd-gallery"><div class="sd-gallery-placeholder"><i class="ph ph-image" style="font-size:2.2rem;opacity:0.45"></i></div>
            <span class="sd-gallery-nav prev"><i class="ph ph-caret-left"></i></span>
            <span class="sd-gallery-nav next"><i class="ph ph-caret-right"></i></span></div>`;
    }
    if (previewGalleryIndex >= images.length) previewGalleryIndex = 0;
    const img = images[previewGalleryIndex];
    const dots = images.length > 1
        ? `<div class="sd-gallery-dots">${images.map((_, i) => `<span class="sd-gallery-dot${i === previewGalleryIndex ? ' active' : ''}"></span>`).join('')}</div>`
        : '';
    return `<div>
        <div class="sd-gallery">
            <img class="sd-gallery-img" src="${esc(img.url)}" alt="${esc(img.name)}">
            ${images.length > 1 ? `<span class="sd-gallery-nav prev" onclick="slidePreviewGallery(-1,'${context}')"><i class="ph ph-caret-left"></i></span>
            <span class="sd-gallery-nav next" onclick="slidePreviewGallery(1,'${context}')"><i class="ph ph-caret-right"></i></span>` : ''}
        </div>${dots}</div>`;
}

function slidePreviewGallery(dir, context = 'create') {
    const total = context === 'edit' ? editSwImages.length : createProductState.softwareImages.length;
    if (total <= 1) return;
    previewGalleryIndex = (previewGalleryIndex + dir + total) % total;
    if (context === 'edit') renderEditPreview('software');
    else renderSoftwareCreatePreview();
}

function renderSoftwareCreatePreview() {
    const name = valueOf('new-p-name');
    const vendor = valueOf('new-p-vendor');
    const pitch = valueOf('new-p-pitch');
    const features = collectSoftwareFeatures();
    const industries = getCheckedValues('new-p-industries');
    const images = createProductState.softwareImages;
    const icon = createProductState.softwareIcon;
    const initials = name ? getProductInitials(name) : '';
    const target = document.getElementById('create-live-preview');
    if (!target) return;

    const SVG_FEATURES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:#7c8ec8;flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    const SVG_INDUSTRIES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:#7c8ec8;flex-shrink:0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
    const PLACEHOLDER_STYLE = 'color:#9aa6bf';

    const featuresHtml = features.length
        ? `<ul class="sd-feature-list">${features.map(f => `<li class="sd-feature-item"><span class="sd-feature-dot"></span><span>${esc(f)}</span></li>`).join('')}</ul>`
        : `<div style="padding:12px 14px;${PLACEHOLDER_STYLE};font-size:0.82rem">Add up to 5 key features...</div>`;

    const industriesHtml = industries.length
        ? `<div class="sd-industry-list">${industries.map(i => `<span class="sd-industry-chip">${esc(i)}</span>`).join('')}</div>`
        : `<div style="padding:12px 14px;${PLACEHOLDER_STYLE};font-size:0.82rem">Select applicable industries...</div>`;

    const markContent = icon
        ? `<img src="${esc(icon.url)}" alt="${esc(icon.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:20px">`
        : initials
            ? esc(initials)
            : '<i class="ph ph-package" style="font-size:1.4rem;opacity:0.5"></i>';

    target.innerHTML = `
        <div class="sw-preview-eyebrow"><i class="ph ph-eye" style="font-size:0.8rem"></i> Live Preview</div>
        <div class="software-live-preview">
            <div class="sd-hero" style="position:relative;padding-top:28px">
                <div class="sd-hero-header">
                    <div class="sd-mark">${markContent}</div>
                    <div style="min-width:0;flex:1">
                        <p class="sd-company">${vendor ? esc(vendor) : `<span style="${PLACEHOLDER_STYLE}">Company Name</span>`}</p>
                        <h2 class="sd-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name ? esc(name) : `<span style="${PLACEHOLDER_STYLE};font-weight:500">Product Name</span>`}</h2>
                    </div>
                </div>
                <p class="sd-tagline">${pitch ? esc(pitch) : `<span style="${PLACEHOLDER_STYLE}">Short product description...</span>`}</p>
            </div>
            <div class="sd-content">
                <section class="sd-meta-block">
                    <div class="sd-meta-title">${SVG_FEATURES} Key Features</div>
                    ${featuresHtml}
                </section>
                ${renderPreviewGallery(images)}
                <section class="sd-meta-block">
                    <div class="sd-meta-title">${SVG_INDUSTRIES} Applicable Industries</div>
                    ${industriesHtml}
                </section>
            </div>
            <div class="sd-action-footer" style="margin-top:auto">
                <button class="sd-action-primary" type="button">Select Add-on</button>
                <span class="sd-quote-link">Request a custom quote for this add-on</span>
            </div>
        </div>`;
}

function renderCreateProductPreview(type) {
    if (type === 'software') renderSoftwareCreatePreview();
    else renderHardwareCreatePreview();
}

function setupCreateProductBindings(type) {
    const form = document.getElementById('create-product-form');
    if (!form) return;
    const rerender = () => renderCreateProductPreview(type);
    form.querySelectorAll('input, textarea, select').forEach(el => {
        // File inputs have dedicated upload handlers that own validation and
        // preview updates. A generic change listener would immediately clear
        // an upload error raised by those handlers during the same event.
        if (el.type === 'file') return;
        el.addEventListener('input', () => {
            setCreateError(el.id, '');
            if (el.id.startsWith('new-p-feature-')) {
                const idx = el.id.replace('new-p-feature-', '');
                const cnt = document.getElementById(`new-p-feature-${idx}-count`);
                if (cnt) cnt.textContent = `${el.value.length}/${SOFTWARE_FEATURE_MAX_CHARS}`;
            }
            rerender();
        });
        el.addEventListener('change', () => {
            setCreateError(el.id, '');
            rerender();
        });
    });
    renderImageStatus(type);
    if (type === 'hardware') updateSpecCounter();
    rerender();
}

function validateRequiredField(id, message = 'This field is required.') {
    const ok = !!valueOf(id);
    setCreateError(id, ok ? '' : message);
    return ok;
}

function validateCreateProductForm(type) {
    let ok = true;
    ok = validateRequiredField('new-p-name', 'Please enter Product Name.') && ok;
    if (!(type === 'hardware' && getHwFormat() === 'nonstandard')) {
        ok = validateRequiredField('new-p-vendor', 'Please enter Vendor.') && ok;
    }
    if (type === 'hardware') {
        const fmt = getHwFormat();
        ok = validateRequiredField('new-p-product-type', 'Please select Product Type.') && ok;
        if (fmt === 'standard') {
            ok = validateRequiredField('new-p-brand', 'Please enter Brand.') && ok;
            ok = validateRequiredField('new-p-model', 'Please enter Model.') && ok;
            const specs = collectHardwareSpecs();
            if (specs.length < HW_KEY_SPEC_MIN_ITEMS) {
                setCreateError('new-p-specs', `At least ${HW_KEY_SPEC_MIN_ITEMS} Key Specifications are required.`);
                ok = false;
            } else {
                setCreateError('new-p-specs', '');
            }
        } else {
            // Non-standard: at least HW_KEY_SPEC_MIN_ITEMS items combined across platform + specs
            const platforms = collectNsItems('new-p-platform');
            const nsSpecs = collectNsItems('new-p-nsspec');
            if (platforms.length + nsSpecs.length < HW_KEY_SPEC_MIN_ITEMS) {
                setCreateError('new-p-ns', `At least ${HW_KEY_SPEC_MIN_ITEMS} items across Processor/Platform and Key Specifications are required.`);
                ok = false;
            } else {
                setCreateError('new-p-ns', '');
            }
        }
        const imageValidation = validateProductImageFiles(
            createProductState.hardwareImage ? [createProductState.hardwareImage.file] : [],
            { required: true },
        );
        if (!imageValidation.valid) {
            setCreateError('new-p-image', imageValidation.message);
            ok = false;
        }
    } else {
        // Software: at least 1 category required
        const categories = getCheckedValues('new-p-categories');
        if (!categories.length) {
            setCreateError('new-p-categories', 'Please select Category.');
            ok = false;
        } else {
            setCreateError('new-p-categories', '');
        }
        // Software: at least 1 feature recommended
        const features = collectSoftwareFeatures();
        if (features.length < 1) {
            setCreateError('new-p-feature-0', 'At least 1 Key Feature is recommended.');
            ok = false;
        }
    }
    return ok;
}

function showCreateProductModal(type) {
    const isSW = type === 'software';
    createProductState = { type, hardwareImage: null, softwareIcon: null, softwareImages: [] };
    const title = isSW ? 'Create Software Product Draft' : 'Create Hardware Product Draft';
    const hardwareOptions = HARDWARE_PRODUCT_TYPES
        .filter(item => item.is_active)
        .map(item => `<option value="${esc(item.label)}">${esc(item.label)}</option>`)
        .join('');
    const allHW = PRODUCTS.filter(p => p.product_type === 'hardware' && p.status === 'published');

    const hardwareFields = `
        ${createFormSection('ph-layout', 'Product Format', 'Choose the storefront display format. This cannot be changed after creation.', `
            <div class="format-selector" id="hw-format-selector">
                <input type="radio" name="hw-format" id="hw-format-standard" value="standard" checked>
                <label for="hw-format-standard" class="is-active" onclick="switchHwFormat('standard')"><i class="ph ph-list-bullets"></i> Standard</label>
                <input type="radio" name="hw-format" id="hw-format-nonstandard" value="nonstandard">
                <label for="hw-format-nonstandard" onclick="switchHwFormat('nonstandard')"><i class="ph ph-cube"></i> Non-standard</label>
            </div>
            <div class="field-hint" style="margin-top:8px"><i class="ph ph-warning-circle"></i> Format is permanent and cannot be changed after creation.</div>
        `)}
        ${createFormSection('ph-identification-card', 'Basic Info', 'Core product identity and catalog classification.', `
        ${createField('new-p-name', 'Product Name', { required: true, maxlength: 100, placeholder: 'e.g. Brand + Model or custom display name' })}
        <div class="form-grid-two">
            <div id="new-p-vendor-block" class="min-w-0">${createField('new-p-vendor', 'Vendor', { required: true, maxlength: 100, placeholder: 'e.g. Phison Electronics' })}</div>
            <div>
                <label for="new-p-product-type" class="field-label">Product Type <span class="req">*</span></label>
                <select id="new-p-product-type" class="input-field" required>
                    <option value="">Please select</option>
                    ${hardwareOptions}
                </select>
                <div id="new-p-product-type-error" class="field-error-text"></div>
            </div>
        </div>`)}

        <!-- ── Standard-only fields ── -->
        <div id="hw-standard-section">
        ${createFormSection('ph-identification-card', 'Model Details', 'Brand and model number for standard products.', `
            <div class="form-grid-two">
                ${createField('new-p-brand', 'Brand', { required: true, maxlength: 50, placeholder: 'e.g. GIGABYTE' })}
                ${createField('new-p-model', 'Model', { required: true, maxlength: 50, placeholder: 'e.g. W773-80' })}
            </div>`)}
        ${createFormSection('ph-sliders-horizontal', 'Key Specifications', 'The first three populated rows are required for draft creation.', `
        <div>
            <div class="flex items-center justify-between mb-2">
                <div>
                    <div class="field-label" style="margin:0">Key Specifications <span class="text-red-400">*</span></div>
                    <div class="field-hint">Min ${HW_KEY_SPEC_MIN_ITEMS} required · Max ${HW_KEY_SPEC_MAX_ITEMS} · ${HW_KEY_SPEC_MAX_CHARS} chars each</div>
                </div>
                <button type="button" class="btn-ghost" style="font-size:12px;padding:3px 8px" onclick="addSpecRow()"><i class="ph ph-plus" style="font-size:11px"></i> Add</button>
            </div>
            <div id="new-p-spec-list" class="space-y-2">
                ${Array.from({ length: HW_KEY_SPEC_MIN_ITEMS }, (_, i) => nsRowHtml('new-p-spec-' + i, 'e.g. Intel Xeon 6730P 32 Core', '', 'updateSpecCounter()', 'renderHardwareCreatePreview()')).join('')}
            </div>
            <div id="spec-item-counter" style="margin-top:8px;font-size:11px;font-weight:600;color:#86868b">0 / ${HW_KEY_SPEC_MAX_ITEMS} items used</div>
            <div id="new-p-specs-error" class="field-error-text"></div>
        </div>`)}
        </div>

        <!-- ── Non-standard fields ── -->
        <div id="hw-nonstandard-section" style="display:none">
        ${createFormSection('ph-cpu', 'Processor / Platform', 'Supported processors and platforms for this product.', `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <div class="field-label" style="margin:0">Processor / Platform</div>
                    <button type="button" class="btn-ghost" style="font-size:12px;padding:3px 8px" onclick="addNsRow('platform')"><i class="ph ph-plus" style="font-size:11px"></i> Add</button>
                </div>
                <div class="field-hint" style="margin-bottom:8px">Processor / Platform and Key Specifications share a combined max of ${HW_NS_MAX_ITEMS} (min ${HW_KEY_SPEC_MIN_ITEMS}).</div>
                <div id="new-p-platform-list" class="space-y-2">
                    ${nsRowHtml('new-p-platform-0', 'e.g. NVIDIA RTX A6000', '', 'updateNsCounter()', 'renderHardwareCreatePreview()')}
                </div>
            </div>`)}
        ${createFormSection('ph-sliders-horizontal', 'Key Specifications', 'Technical specifications for this product.', `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <div class="field-label" style="margin:0">Key Specifications</div>
                    <button type="button" class="btn-ghost" style="font-size:12px;padding:3px 8px" onclick="addNsRow('spec')"><i class="ph ph-plus" style="font-size:11px"></i> Add</button>
                </div>
                <div class="field-hint" style="margin-bottom:8px">Processor / Platform and Key Specifications share a combined max of ${HW_NS_MAX_ITEMS} (min ${HW_KEY_SPEC_MIN_ITEMS}).</div>
                <div id="new-p-nsspec-list" class="space-y-2">
                    ${nsRowHtml('new-p-nsspec-0', 'e.g. Max. GPU x8', '', 'updateNsCounter()', 'renderHardwareCreatePreview()')}
                </div>
                <div id="ns-item-counter" style="margin-top:8px;font-size:11px;font-weight:600;color:#86868b">0 / ${HW_NS_MAX_ITEMS} items used</div>
                <div id="new-p-ns-error" class="field-error-text"></div>
            </div>`)}
        </div>

        ${createFormSection('ph-image', 'Product Image', 'Single storefront image. New uploads replace the previous image.', `
        <div>
            <label class="field-label">Product Image <span class="req">*</span></label>
            <label class="file-upload-wrap">
                <input id="new-p-image" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onchange="handleHardwareImageUpload(this)">
                <span class="file-upload-btn"><i class="ph ph-upload-simple"></i> Choose File</span>
                <span class="file-upload-text">Max 5MB · JPG / JPEG / PNG</span>
            </label>
            <div id="new-p-image-error" class="field-error-text"></div>
            <div id="hardware-image-status" class="mt-2"></div>
        </div>`)}
        ${createFormSection('ph-sparkle', 'Frontend Display', 'Optional storefront badge and link treatment.', `
            <label class="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" id="new-p-aidaptiv" class="w-4 h-4 rounded border-[#e8eaed] accent-aiso">
                <div>
                    <div class="text-sm font-semibold text-[#1d1d1f]">aiDAPTIV</div>
                    <div class="text-[11px] text-[#86868b]">Display aiDAPTIV logo, badge, and link on the frontend preview</div>
                </div>
            </label>
        `)}`;

    const softwareFields = `
        ${createFormSection('ph-identification-card', 'Basic Info', 'Product identity shown in lists and storefront preview.', `
        ${createField('new-p-name', 'Product Name', { required: true, maxlength: 100, placeholder: 'e.g. OrientAI Express' })}
        ${createField('new-p-vendor', 'Vendor', { required: true, maxlength: 100, placeholder: 'e.g. TPIsoftware Corporation' })}
        <div>
            <label class="field-label">Product Icon</label>
            <label class="file-upload-wrap">
                <input id="new-p-icon" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onchange="handleSoftwareIconUpload(this)">
                <span class="file-upload-btn"><i class="ph ph-upload-simple"></i> Choose File</span>
                <span class="file-upload-text">Square icon · Max 5MB · JPG / JPEG / PNG</span>
            </label>
            <div id="new-p-icon-error" class="field-error-text"></div>
            <div id="software-icon-status" class="mt-2"></div>
        </div>
        `)}
        ${createFormSection('ph-chat-centered-text', 'Positioning', 'Customer-facing copy, category, and feature bullets.', `
        ${createTextArea('new-p-pitch', 'Short Pitch', { maxlength: 300, rows: 2, placeholder: 'One-line pitch...' })}
        <div>
            <div class="field-label mb-3">Category <span class="req">*</span> <span class="text-[10px] text-[#86868b] font-bold" style="margin-left:4px">Max ${SW_CATEGORY_MAX}</span></div>
            ${renderSwCategoryChecks('new-p-categories')}
        </div>
        <div>
            <div class="flex items-center justify-between mb-3">
                <div class="field-label">Key Features</div>
                <span class="text-[10px] text-[#86868b] font-bold">Max 5 · 150 chars each</span>
            </div>
            <div class="space-y-2">${renderSoftwareFeatureInputs()}</div>
        </div>
        <div>
            <div class="field-label mb-3">Applicable Industries</div>
            <div id="new-p-industries" class="flex flex-wrap gap-2">
                ${SOFTWARE_INDUSTRY_OPTIONS.filter(o => o.is_active).map(o => `<label class="preview-pill cursor-pointer"><input type="checkbox" value="${esc(o.label)}" class="mr-2 accent-aiso">${esc(o.label)}</label>`).join('')}
            </div>
        </div>`)}
        ${createFormSection('ph-images', 'Product Images', 'Upload up to five images for the storefront preview.', `
            <label class="field-label">Product Images</label>
            <label class="file-upload-wrap">
                <input id="new-p-images" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple onchange="handleSoftwareImageUpload(this)">
                <span class="file-upload-btn"><i class="ph ph-upload-simple"></i> Choose Files</span>
                <span class="file-upload-text">Max ${PRODUCT_IMAGE_MAX_COUNT} images · 5MB each · JPG / JPEG / PNG</span>
            </label>
            <div id="new-p-images-error" class="field-error-text"></div>
            <div id="software-image-status" class="mt-2"></div>
        `)}
        ${createFormSection('ph-hard-drives', 'Compatibility', 'Select hardware products that can pair with this software.', `
            <div class="field-label mb-3">Compatible Hardware</div>
            <div id="new-p-compatible-hw" class="space-y-2">
                ${allHW.map(h => `<label class="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] cursor-pointer hover:bg-[#f5f5f7] transition">
                    <input type="checkbox" value="${esc(h.id)}" class="w-4 h-4 accent-aiso">
                    <i class="ph ph-hard-drives text-aiso"></i>
                    <span class="font-semibold text-[#1d1d1f]">${esc(h.name)}</span>
                    <span class="ml-auto text-xs text-[#86868b]">${esc(h.model || h.sub_category || '')}</span>
                </label>`).join('')}
                ${!allHW.length ? '<div class="text-xs text-[#86868b] italic">No published hardware products available</div>' : ''}
            </div>
        `)}`;

    showModal(`
        <div class="create-modal-shell">
            <div class="create-modal-header">
                <div class="create-modal-title-row">
                    <div class="create-modal-icon"><i class="ph ${isSW ? 'ph-app-window' : 'ph-hard-drives'}"></i></div>
                    <div class="min-w-0">
                        <div class="create-modal-kicker">${isSW ? 'Software Product' : 'Hardware Product'}</div>
                        <h3 class="text-xl font-bold truncate">${title}</h3>
                    </div>
                </div>
                <button onclick="closeModal()" class="create-modal-close" aria-label="Close"><i class="ph ph-x text-xl"></i></button>
            </div>
            <div class="create-modal-grid">
            <div class="create-form-scroll">
                <form id="create-product-form" novalidate>
                    ${isSW ? softwareFields : hardwareFields}
                    <div class="form-actions">
                        <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
                        <button type="submit" class="btn-primary">Create Draft</button>
                    </div>
                </form>
            </div>
            <div id="create-live-preview" class="create-preview-scroll ${isSW ? 'is-software' : 'is-hardware'}"></div>
            </div>
        </div>`, true);

    document.getElementById('create-product-form').addEventListener('submit', event => {
        event.preventDefault();
        createProduct(type);
    });
    setupCreateProductBindings(type);
}

function createProduct(type) {
    if (!validateCreateProductForm(type)) {
        showToast('Please fix the highlighted fields', 'error');
        return;
    }
    const isSW = type === 'software';
    const isNsHw = !isSW && getHwFormat() === 'nonstandard';
    const name = valueOf('new-p-name');
    const vendorName = isNsHw ? '' : valueOf('new-p-vendor');
    const newCategories = isSW ? getCheckedValues('new-p-categories').slice(0, SW_CATEGORY_MAX) : [];
    const today = new Date().toISOString().slice(0, 10);
    const newP = {
        id: `${type.slice(0, 2)}${Date.now() % 100000}`,
        product_type: type,
        vendor_id: isNsHw ? null : getMatchingVendorId(vendorName, type),
        vendor_name: vendorName,
        name,
        brand: isSW ? vendorName : valueOf('new-p-brand'),
        sub_category: isSW ? (newCategories[0] || '') : valueOf('new-p-product-type'),
        short_description: '',
        status: 'draft',
        display_order: PRODUCTS.filter(p => p.product_type === type).length + 1,
        created_at: today,
        updated_at: today,
    };

    if (isSW) {
        newP.categories = newCategories;
        newP.tagline = valueOf('new-p-pitch');
        newP.sw_category = 'optional';
        newP.features = collectSoftwareFeatures();
        newP.industries = getCheckedValues('new-p-industries');
        newP.compatible_hardware = getCheckedValues('new-p-compatible-hw');
        newP.photos = createProductState.softwareImages.map(img => img.name);
        newP.image_name = createProductState.softwareImages[0]?.name || '';
        newP.icon_name = createProductState.softwareIcon?.name || '';
        newP.photos_data = createProductState.softwareImages.map(img => img.dataUrl).filter(Boolean);
        newP.image_data = createProductState.softwareImages[0]?.dataUrl || '';
        newP.icon_data = createProductState.softwareIcon?.dataUrl || '';
    } else {
        const fmt = getHwFormat();
        newP.product_format = fmt;
        newP.is_aidaptiv = document.getElementById('new-p-aidaptiv')?.checked || false;
        newP.image_name = createProductState.hardwareImage?.name || '';
        newP.photos = createProductState.hardwareImage ? [createProductState.hardwareImage.name] : [];
        newP.image_data = createProductState.hardwareImage?.dataUrl || '';
        newP.photos_data = createProductState.hardwareImage?.dataUrl ? [createProductState.hardwareImage.dataUrl] : [];
        if (fmt === 'standard') {
            newP.model = valueOf('new-p-model');
            newP.key_specifications = collectHardwareSpecs();
            newP.bestFor = [];
        } else {
            newP.model = '';
            newP.ns_platforms = collectNsItems('new-p-platform');
            newP.key_specifications = collectNsItems('new-p-nsspec');
            newP.bestFor = [];
        }
    }

    PRODUCTS.push(newP);
    logActivity('Created', name, 'New draft created');
    closeModal();
    showToast(`${name} has been created as a draft.`, 'success');
    navigate(isSW ? 'sw-products' : 'hw-products');
}

function showEditProductModal(pid, source) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    if (p.status === 'archived') { showToast('Archived products cannot be edited. Please restore the product as a draft before making changes.', 'error'); return; }
    // Remember where Edit was opened from so saveProduct can return there.
    editReturnView = source === 'list' ? 'list' : 'detail';
    const isSW = p.product_type === 'software';
    const storedSwImages = (p.photos_data?.length ? p.photos_data : (p.image_data ? [p.image_data] : []));
    editSwImages = storedSwImages.map((url, i) => ({
        name: p.photos?.[i] || p.image_name || `Product image ${i + 1}`,
        url,
        dataUrl: url,
        isExisting: true,
    }));
    editSwIcon = p.icon_data ? { name: p.icon_name || 'Product icon', url: p.icon_data, dataUrl: p.icon_data, isExisting: true } : null;
    editHwImage = p.image_data ? { name: p.image_name || p.photos?.[0] || 'Product image', url: p.image_data, dataUrl: p.image_data, isExisting: true } : null;
    editHwFormat = p.product_format || 'standard';
    const publishedHW = PRODUCTS.filter(x => x.product_type === 'hardware' && x.status === 'published');
    // Currently-referenced hardware that is no longer published: shown checked but disabled (pruned on publish, not silently here)
    const unpublishedRefHW = (p.compatible_hardware || [])
        .map(hid => PRODUCTS.find(x => x.id === hid))
        .filter(h => h && h.status !== 'published');
    const compatHwChoices = [...publishedHW, ...unpublishedRefHW];
    const activeIndustries = SOFTWARE_INDUSTRY_OPTIONS.filter(o => o.is_active);
    const activeHwTypes = HARDWARE_PRODUCT_TYPES.filter(o => o.is_active);

    const featureInputs = Array.from({ length: SOFTWARE_FEATURE_MAX_ITEMS }, (_, i) => {
        const val = (p.features || [])[i] || '';
        return `<div class="flex items-center gap-2">
            <span class="text-xs text-[#86868b] font-bold w-5 text-center">${i + 1}</span>
            <div class="relative flex-1">
                <input id="edit-p-feat-${i}" type="text" maxlength="${SOFTWARE_FEATURE_MAX_CHARS}" class="input-field pr-14 w-full" value="${esc(val)}" placeholder="${i < 1 ? 'e.g. Core capability...' : 'Optional'}" oninput="updateCharCounter('edit-p-feat-${i}')">
                <span id="edit-p-feat-${i}-count" class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#86868b]">${val.length}/${SOFTWARE_FEATURE_MAX_CHARS}</span>
            </div>
        </div>`;
    }).join('');

    const editStdSpecs = (p.product_format || 'standard') === 'standard' ? (p.key_specifications || []) : [];
    const specInputs = (editStdSpecs.length ? editStdSpecs : ['']).map((v, i) =>
        nsRowHtml(`edit-p-spec-${i}`, 'e.g. Intel Xeon 6730P 32 Core', v, 'updateEditSpecCounter()', "renderEditPreview('hardware')")).join('');

    const swFields = `
        ${createFormSection('ph-identification-card', 'Basic Info', 'Core product identity.', `
            ${createField('edit-p-name', 'Product Name', { required: true, maxlength: 100 })}
            ${createField('edit-p-vendor', 'Vendor', { required: true, maxlength: 100 })}
        `)}
        ${createFormSection('ph-chat-centered-text', 'Positioning', 'Customer-facing copy, category, and features.', `
            <div>
                <div class="field-label mb-3">Category <span class="req">*</span> <span class="text-[10px] text-[#86868b] font-bold" style="margin-left:4px">Max ${SW_CATEGORY_MAX}</span></div>
                ${renderSwCategoryChecks('edit-p-categories', getSwCategories(p))}
            </div>
            ${createField('edit-p-tagline', 'Short Pitch', { maxlength: 300 })}
            <div>
                <div class="flex items-center justify-between mb-3">
                    <div class="field-label">Key Features</div>
                    <span class="text-[10px] text-[#86868b] font-bold">Max ${SOFTWARE_FEATURE_MAX_ITEMS} · 150 chars each</span>
                </div>
                <div class="space-y-2">${featureInputs}</div>
            </div>
            <div>
                <div class="field-label mb-3">Applicable Industries</div>
                <div id="edit-p-industries" class="flex flex-wrap gap-2">
                    ${activeIndustries.map(o => `<label class="preview-pill cursor-pointer"><input type="checkbox" value="${esc(o.label)}" class="mr-2 accent-aiso" ${(p.industries || []).includes(o.label) ? 'checked' : ''}>${esc(o.label)}</label>`).join('')}
                </div>
            </div>
        `)}
        ${createFormSection('ph-images', 'Product Images', 'Upload up to five images for the storefront preview.', `
            <div>
                <label class="field-label">Product Images</label>
                <label class="file-upload-wrap">
                    <input id="edit-p-images" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple onchange="handleEditSwImageUpload(this)">
                    <span class="file-upload-btn"><i class="ph ph-upload-simple"></i> Choose Files</span>
                    <span class="file-upload-text">Max ${PRODUCT_IMAGE_MAX_COUNT} images · 5MB each · JPG / JPEG / PNG</span>
                </label>
                <div id="edit-p-images-error" class="field-error-text"></div>
            </div>
            <div id="edit-p-images-status"></div>
            <div>
                <label class="field-label">Product Icon</label>
                <label class="file-upload-wrap">
                    <input id="edit-p-icon" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onchange="handleEditSwIconUpload(this)">
                    <span class="file-upload-btn"><i class="ph ph-upload-simple"></i> Choose File</span>
                    <span class="file-upload-text">Square icon · Max 5MB · JPG / JPEG / PNG</span>
                </label>
                <div id="edit-p-icon-error" class="field-error-text"></div>
            </div>
            <div id="edit-p-icon-status"></div>
        `)}
        ${createFormSection('ph-hard-drives', 'Compatibility', 'Hardware products that pair with this software.', `
            <div class="field-label mb-3">Compatible Hardware</div>
            <div id="edit-p-compat-hw" class="space-y-2">
                ${compatHwChoices.map(h => {
                    const isUnpub = h.status !== 'published';
                    return `<label class="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] ${isUnpub ? 'opacity-60' : 'cursor-pointer hover:bg-[#f5f5f7]'} transition">
                    <input type="checkbox" value="${esc(h.id)}" class="w-4 h-4 accent-aiso" ${(p.compatible_hardware || []).includes(h.id) ? 'checked' : ''} ${isUnpub ? 'disabled' : ''}>
                    <i class="ph ph-hard-drives text-aiso"></i>
                    <span class="font-semibold text-[#1d1d1f]">${esc(h.name)}${isUnpub ? ' <span style="color:#d97706;font-weight:500">(not published)</span>' : ''}</span>
                    <span class="ml-auto text-xs text-[#86868b]">${esc(h.model || h.sub_category || '')}</span>
                </label>`;
                }).join('')}
                ${!compatHwChoices.length ? '<div class="text-xs text-[#86868b] italic">No published hardware products available</div>' : ''}
            </div>
        `)}`;

    const hwFmt = p.product_format || 'standard';
    const isStandardHw = hwFmt === 'standard';
    const fmtBadgeHtml = `<div style="margin-bottom:4px">
        <span class="format-badge ${isStandardHw ? 'is-standard' : 'is-nonstandard'}">
            <i class="ph ${isStandardHw ? 'ph-list-bullets' : 'ph-cube'}"></i>
            ${isStandardHw ? 'Standard' : 'Non-standard'}
        </span>
        <span style="font-size:11px;color:#86868b;margin-left:6px">Format is locked after creation</span>
    </div>`;

    // Build non-standard edit inputs from existing data
    const editNsPlatforms = (p.ns_platforms || []);
    const editNsSpecs = isStandardHw ? [] : (p.key_specifications || []);
    const editNsPlatformRows = (editNsPlatforms.length ? editNsPlatforms : ['']).map((v, i) =>
        nsRowHtml(`edit-p-platform-${i}`, 'e.g. NVIDIA RTX A6000', v, 'updateEditNsCounter()', "renderEditPreview('hardware')")).join('');
    const editNsSpecRows = (editNsSpecs.length ? editNsSpecs : ['']).map((v, i) =>
        nsRowHtml(`edit-p-nsspec-${i}`, 'e.g. Max. GPU x8', v, 'updateEditNsCounter()', "renderEditPreview('hardware')")).join('');

    const hwFields = `
        ${createFormSection('ph-identification-card', 'Basic Info', 'Core product identity and classification.', `
            ${fmtBadgeHtml}
            ${createField('edit-p-name', 'Product Name', { required: true, maxlength: 100 })}
            <div class="form-grid-two">
                ${isStandardHw ? createField('edit-p-vendor', 'Vendor', { required: true, maxlength: 100, wrapClass: 'min-w-0' }) : ''}
                <div>
                    <label for="edit-p-hw-type" class="field-label">Product Type</label>
                    <select id="edit-p-hw-type" class="input-field">
                        ${activeHwTypes.map(o => `<option value="${esc(o.label)}" ${o.label === p.sub_category ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                    </select>
                </div>
            </div>
            ${isStandardHw ? `<div class="form-grid-two">
                ${createField('edit-p-brand', 'Brand', { required: true, maxlength: 50 })}
                ${createField('edit-p-model', 'Model', { required: true, maxlength: 50 })}
            </div>` : ''}
        `)}
        ${isStandardHw ? createFormSection('ph-sliders-horizontal', 'Key Specifications', 'Displayed as bullet points on the storefront card.', `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <div>
                        <div class="field-label" style="margin:0">Key Specifications</div>
                        <div class="field-hint">Min ${HW_KEY_SPEC_MIN_ITEMS} required · Max ${HW_KEY_SPEC_MAX_ITEMS} · ${HW_KEY_SPEC_MAX_CHARS} chars each</div>
                    </div>
                    <button type="button" class="btn-ghost" style="font-size:12px;padding:3px 8px" onclick="addEditSpecRow()"><i class="ph ph-plus" style="font-size:11px"></i> Add</button>
                </div>
                <div id="edit-p-spec-list" class="space-y-2">${specInputs}</div>
                <div id="edit-spec-item-counter" style="margin-top:8px;font-size:11px;font-weight:600;color:#86868b"></div>
            </div>
        `) : `
        ${createFormSection('ph-cpu', 'Processor / Platform', 'Supported processors and platforms.', `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <div class="field-label" style="margin:0">Processor / Platform</div>
                    <button type="button" class="btn-ghost" style="font-size:12px;padding:3px 8px" onclick="addEditNsRow('platform')"><i class="ph ph-plus" style="font-size:11px"></i> Add</button>
                </div>
                <div class="field-hint" style="margin-bottom:8px">Processor / Platform and Key Specifications share a combined max of ${HW_NS_MAX_ITEMS} (min ${HW_KEY_SPEC_MIN_ITEMS}).</div>
                <div id="edit-p-platform-list" class="space-y-2">${editNsPlatformRows}</div>
            </div>`)}
        ${createFormSection('ph-sliders-horizontal', 'Key Specifications', 'Technical specifications.', `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <div class="field-label" style="margin:0">Key Specifications</div>
                    <button type="button" class="btn-ghost" style="font-size:12px;padding:3px 8px" onclick="addEditNsRow('spec')"><i class="ph ph-plus" style="font-size:11px"></i> Add</button>
                </div>
                <div class="field-hint" style="margin-bottom:8px">Processor / Platform and Key Specifications share a combined max of ${HW_NS_MAX_ITEMS} (min ${HW_KEY_SPEC_MIN_ITEMS}).</div>
                <div id="edit-p-nsspec-list" class="space-y-2">${editNsSpecRows}</div>
                <div id="edit-ns-item-counter" style="margin-top:8px;font-size:11px;font-weight:600;color:#86868b"></div>
            </div>`)}
        `}
        ${createFormSection('ph-image', 'Product Image', 'Main product image for the storefront card.', `
            <div>
                <label class="field-label">Product Image</label>
                <label class="file-upload-wrap">
                    <input id="edit-p-hw-image" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onchange="handleEditHwImageUpload(this)">
                    <span class="file-upload-btn"><i class="ph ph-upload-simple"></i> Choose File</span>
                    <span class="file-upload-text">5MB max · JPG / JPEG / PNG</span>
                </label>
                <div id="edit-p-hw-image-error" class="field-error-text"></div>
            </div>
            <div id="edit-p-hw-image-status"></div>
        `)}
        ${createFormSection('ph-sparkle', 'Frontend Display', 'Storefront badge and link treatment.', `
            <label class="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" id="edit-p-aidaptiv" class="w-4 h-4 rounded border-[#e8eaed] accent-aiso" ${p.is_aidaptiv ? 'checked' : ''}>
                <div>
                    <div class="text-sm font-semibold text-[#1d1d1f]">aiDAPTIV</div>
                    <div class="text-[11px] text-[#86868b]">Display aiDAPTIV logo, badge, and link on the frontend preview</div>
                </div>
            </label>
        `)}`;

    const modalHtml = `
        <div class="create-modal-shell">
            <div class="create-modal-header">
                <div class="create-modal-title-row">
                    <div class="create-modal-icon"><i class="ph ${isSW ? 'ph-app-window' : 'ph-hard-drives'}"></i></div>
                    <div class="min-w-0">
                        <div class="create-modal-kicker">${isSW ? 'Software' : 'Hardware'} · ${!isSW ? (hwFmt === 'standard' ? 'Standard' : 'Non-standard') + ' · ' : ''}Last updated ${esc(p.updated_at || '—')}</div>
                        <h3 class="text-xl font-bold truncate">Edit: ${esc(p.name)}</h3>
                    </div>
                </div>
                <button onclick="closeModal()" class="create-modal-close" aria-label="Close"><i class="ph ph-x text-xl"></i></button>
            </div>
            <div class="create-modal-grid">
                <div class="create-form-scroll">
                    <form id="edit-product-form" onsubmit="event.preventDefault();saveProduct('${p.id}')" novalidate>
                        ${isSW ? swFields : hwFields}
                        <div class="form-actions">
                            <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
                            <button type="submit" class="btn-primary">Save Changes</button>
                        </div>
                    </form>
                </div>
                <div id="edit-live-preview" class="create-preview-scroll ${isSW ? 'is-software' : 'is-hardware'}"></div>
            </div>
        </div>`;
    showModal(modalHtml, true);

    // Pre-fill values
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('edit-p-name', p.name);
    setVal('edit-p-vendor', p.vendor_name);
    updateCharCounter('edit-p-name');
    updateCharCounter('edit-p-vendor');
    if (isSW) {
        setVal('edit-p-tagline', p.tagline);
        updateCharCounter('edit-p-tagline');
        updateSwCategoryLimit('edit-p-categories');
    } else {
        setVal('edit-p-brand', p.brand);
        setVal('edit-p-model', p.model);
        updateCharCounter('edit-p-brand');
        updateCharCounter('edit-p-model');
        if ((p.product_format || 'standard') === 'standard') updateEditSpecCounter();
        else updateEditNsCounter();
    }
    // Render existing image status before binding the live preview.
    if (isSW) {
        renderEditSwImageStatus();
        renderEditSwIconStatus();
    } else {
        renderEditHwImageStatus();
    }

    // Setup live preview bindings
    if (isSW) {
        setupEditPreviewBindings('software');
        renderEditPreview('software');
    } else {
        setupEditPreviewBindings('hardware');
        renderEditPreview('hardware');
    }
}

/* ── Edit modal preview ── */
function setupEditPreviewBindings(type) {
    const form = document.getElementById('edit-product-form');
    if (!form) return;
    const rerender = () => renderEditPreview(type);
    form.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.type === 'file') return;
        if (el.type === 'checkbox') { el.addEventListener('change', rerender); return; }
        el.addEventListener('input', rerender);
        el.addEventListener('change', rerender);
    });
}

function renderEditPreview(type) {
    const target = document.getElementById('edit-live-preview');
    if (!target) return;
    if (type === 'software') renderEditSwPreview(target);
    else renderEditHwPreview(target);
}

function renderEditSwPreview(target) {
    const val = id => (document.getElementById(id)?.value || '').trim();
    const name = val('edit-p-name');
    const vendor = val('edit-p-vendor');
    const pitch = val('edit-p-tagline');
    const features = Array.from({ length: 5 }, (_, i) => val(`edit-p-feat-${i}`)).filter(Boolean);
    const industries = Array.from(document.querySelectorAll('#edit-p-industries input:checked')).map(cb => cb.value);
    const images = editSwImages;
    const icon = editSwIcon;
    const initials = name ? name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) : '';

    const PLACEHOLDER = 'color:#9aa6bf';
    const SVG_F = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:#7c8ec8;flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    const SVG_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:#7c8ec8;flex-shrink:0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';

    const featHtml = features.length
        ? `<ul class="sd-feature-list">${features.map(f => `<li class="sd-feature-item"><span class="sd-feature-dot"></span><span>${esc(f)}</span></li>`).join('')}</ul>`
        : `<div style="padding:12px 14px;${PLACEHOLDER};font-size:0.82rem">Add up to 5 key features...</div>`;
    const indHtml = industries.length
        ? `<div class="sd-industry-list">${industries.map(i => `<span class="sd-industry-chip">${esc(i)}</span>`).join('')}</div>`
        : `<div style="padding:12px 14px;${PLACEHOLDER};font-size:0.82rem">Select applicable industries...</div>`;
    const markContent = icon
        ? `<img src="${esc(icon.url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:20px">`
        : initials ? esc(initials) : '<i class="ph ph-package" style="font-size:1.4rem;opacity:0.5"></i>';

    target.innerHTML = `
        <div class="sw-preview-eyebrow"><i class="ph ph-eye" style="font-size:0.8rem"></i> Live Preview</div>
        <div class="software-live-preview">
            <div class="sd-hero" style="position:relative;padding-top:28px">
                <div class="sd-hero-header">
                    <div class="sd-mark">${markContent}</div>
                    <div style="min-width:0;flex:1">
                        <p class="sd-company">${vendor ? esc(vendor) : `<span style="${PLACEHOLDER}">Company Name</span>`}</p>
                        <h2 class="sd-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name ? esc(name) : `<span style="${PLACEHOLDER};font-weight:500">Product Name</span>`}</h2>
                    </div>
                </div>
                <p class="sd-tagline">${pitch ? esc(pitch) : `<span style="${PLACEHOLDER}">Short product description...</span>`}</p>
            </div>
            <div class="sd-content">
                <section class="sd-meta-block"><div class="sd-meta-title">${SVG_F} Key Features</div>${featHtml}</section>
                ${renderPreviewGallery(images, 'edit')}
                <section class="sd-meta-block"><div class="sd-meta-title">${SVG_I} Applicable Industries</div>${indHtml}</section>
            </div>
            <div class="sd-action-footer" style="margin-top:auto">
                <button class="sd-action-primary" type="button">Select Add-on</button>
                <span class="sd-quote-link">Request a custom quote for this add-on</span>
            </div>
        </div>`;
}

function renderEditHwPreview(target) {
    const val = id => (document.getElementById(id)?.value || '').trim();
    const name = val('edit-p-name') || 'Product Name';
    const category = val('edit-p-hw-type');
    const isAidaptiv = document.getElementById('edit-p-aidaptiv')?.checked || false;
    const image = editHwImage;
    const imgHtml = image
        ? `<img src="${esc(image.url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
        : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#86868b"><i class="ph ph-image" style="font-size:2rem"></i></div>';
    const fmt = editHwFormat;
    const fmtBadge = `<span class="format-badge ${fmt === 'standard' ? 'is-standard' : 'is-nonstandard'}"><i class="ph ${fmt === 'standard' ? 'ph-list-bullets' : 'ph-cube'}"></i> ${fmt === 'standard' ? 'Standard' : 'Non-standard'}</span>`;

    if (fmt === 'nonstandard') {
        const platforms = collectNsItems('edit-p-platform');
        const nsSpecs = collectNsItems('edit-p-nsspec');
        target.innerHTML = `
            <div class="preview-eyebrow"><span class="preview-eyebrow-left"><i class="ph ph-eye" style="font-size:0.8rem"></i> Live Preview</span>${fmtBadge}</div>
            <div class="hw-preview-card">
                <div class="hw-preview-media">${imgHtml}</div>
                <div class="hw-preview-body">
                    <h4 class="hw-preview-title">${esc(name)}</h4>
                    <div class="hw-preview-category">${esc(category || 'Product Type')}</div>
                    <hr class="hw-preview-divider">
                    ${platforms.length ? `<div class="preview-section">
                        <div class="preview-section-title"><i class="ph ph-cpu" style="color:#7c8ec8"></i> Processor / Platform</div>
                        <ul class="hw-spec-list">${platforms.map(s => '<li><span>' + esc(s) + '</span></li>').join('')}</ul>
                    </div>` : ''}
                    ${nsSpecs.length ? `<div class="preview-section">
                        <div class="preview-section-title"><i class="ph ph-sliders-horizontal" style="color:#7c8ec8"></i> Key Specifications</div>
                        <ul class="hw-spec-list">${nsSpecs.map(s => '<li><span>' + esc(s) + '</span></li>').join('')}</ul>
                    </div>` : ''}
                    ${!platforms.length && !nsSpecs.length ? '<div style="padding:10px 14px;color:#6d7695;font-size:0.82rem;font-style:italic">Add platform or spec items...</div>' : ''}
                    ${isAidaptiv ? '<div class="hw-aidaptiv-row"><span style="font-size:1rem;font-weight:900;color:#1d1d1f">aiDAPTIV</span><span class="hw-aidaptiv-link">What is aiDaptiv?</span></div>' : ''}
                    <button type="button" class="hw-preview-cta">Select Hardware</button>
                </div>
            </div>
            <div style="margin-top:10px;text-align:center;font-size:0.62rem;color:#86868b;font-style:italic">Non-standard storefront card preview</div>`;
        return;
    }

    const specs = Array.from({ length: 8 }, (_, i) => val(`edit-p-spec-${i}`)).filter(Boolean);
    target.innerHTML = `
        <div class="preview-eyebrow"><span class="preview-eyebrow-left"><i class="ph ph-eye" style="font-size:0.8rem"></i> Live Preview</span>${fmtBadge}</div>
        <div class="hw-preview-card">
            <div class="hw-preview-media">${imgHtml}</div>
            <div class="hw-preview-body">
                <h4 class="hw-preview-title">${esc(name)}</h4>
                <div class="hw-preview-category">${esc(category || 'Product Type')}</div>
                <hr class="hw-preview-divider">
                <div class="preview-section">
                    <div class="preview-section-title"><i class="ph ph-sliders-horizontal" style="color:#7c8ec8"></i> Key Specifications</div>
                    ${specs.length ? '<ul class="hw-spec-list">' + specs.map(s => '<li><span>' + esc(s) + '</span></li>').join('') + '</ul>' : '<div style="padding:10px 14px 12px;color:#6d7695;font-size:0.82rem;font-style:italic">Fill in key specifications...</div>'}
                </div>
                ${isAidaptiv ? '<div class="hw-aidaptiv-row"><span style="font-size:1rem;font-weight:900;color:#1d1d1f">aiDAPTIV</span><span class="hw-aidaptiv-link">What is aiDaptiv?</span></div>' : ''}
                <button type="button" class="hw-preview-cta">Select Hardware</button>
            </div>
        </div>
        <div style="margin-top:10px;text-align:center;font-size:0.62rem;color:#86868b;font-style:italic">Standard storefront card preview</div>`;
}

/* ── Edit modal image handlers ── */
let editSwImages = [];
let editSwIcon = null;
let editHwImage = null;
let editHwFormat = 'standard';
// Where to return after saving an edit: 'list' (opened from the list) or 'detail' (opened from the detail page).
let editReturnView = 'detail';

function renderEditSwImageStatus() {
    const container = document.getElementById('edit-p-images-status');
    if (!container) return;
    const photos = editSwImages;
    if (!photos.length) { container.innerHTML = ''; return; }
    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:11px;color:#86868b;font-weight:600">${photos.length}/${PRODUCT_IMAGE_MAX_COUNT} images</span>
            <button type="button" onclick="clearEditSwImages()" style="font-size:11px;color:#d97706;font-weight:600;background:none;border:none;cursor:pointer">Clear all</button>
        </div>
        <div class="product-image-sort-list">${photos.map((img, i) => renderSortableProductImage(img, i, 'edit')).join('')}</div>
        ${photos.length > 1 ? '<div class="product-image-sort-hint"><i class="ph ph-arrows-out-line-horizontal"></i> Drag images to reorder. The first image is the main image.</div>' : ''}`;
}

function removeEditSwImage(index) {
    editSwImages.splice(index, 1);
    renderEditSwImageStatus();
    renderEditPreview('software');
}

function clearEditSwImages() {
    editSwImages = [];
    renderEditSwImageStatus();
    renderEditPreview('software');
}

function renderEditSwIconStatus() {
    const statusEl = document.getElementById('edit-p-icon-status');
    if (!statusEl) return;
    statusEl.innerHTML = editSwIcon ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;background:#f5f5f7;font-size:11px;color:#1d1d1f;font-weight:500"><img src="${esc(editSwIcon.url)}" alt="" style="width:18px;height:18px;border-radius:4px;object-fit:cover"> ${esc(editSwIcon.name)} <button type="button" onclick="editSwIcon=null;renderEditSwIconStatus();renderEditPreview('software')" style="background:none;border:none;cursor:pointer;color:#86868b;font-size:12px;padding:0">&times;</button></span>` : '';
}

function renderEditHwImageStatus() {
    const statusEl = document.getElementById('edit-p-hw-image-status');
    if (!statusEl) return;
    statusEl.innerHTML = editHwImage ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;background:#f5f5f7;font-size:11px;color:#1d1d1f;font-weight:500"><img src="${esc(editHwImage.url)}" alt="" style="width:18px;height:18px;border-radius:4px;object-fit:cover"> ${esc(editHwImage.name)} <button type="button" onclick="editHwImage=null;renderEditHwImageStatus();renderEditPreview('hardware')" style="background:none;border:none;cursor:pointer;color:#86868b;font-size:12px;padding:0">&times;</button></span>` : '';
}

function handleEditSwImageUpload(input) {
    setCreateError('edit-p-images', '');
    const files = Array.from(input.files || []);
    const validation = validateProductImageFiles(files, {
        currentCount: editSwImages.length,
        maxCount: PRODUCT_IMAGE_MAX_COUNT,
    });
    if (!validation.valid) {
        setProductImageValidationError('edit-p-images', validation);
        input.value = '';
        return;
    }
    editSwImages.push(...files.map(f => {
        const obj = { file: f, name: f.name, url: URL.createObjectURL(f) };
        obj.dataPromise = Store.compressImage(f).then(d => { obj.dataUrl = d; }).catch(() => {});
        return obj;
    }));
    input.value = '';
    renderEditSwImageStatus();
    renderEditPreview('software');
}

function handleEditSwIconUpload(input) {
    setCreateError('edit-p-icon', '');
    const file = input.files?.[0];
    if (!file) return;
    const validation = validateProductImageFiles([file], { required: true });
    if (!validation.valid) {
        setProductImageValidationError('edit-p-icon', validation);
        input.value = ''; return;
    }
    editSwIcon = { file, name: file.name, url: URL.createObjectURL(file) };
    const editIconObj = editSwIcon;
    editIconObj.dataPromise = Store.compressImage(file).then(d => { editIconObj.dataUrl = d; }).catch(() => {});
    renderEditPreview('software');
    renderEditSwIconStatus();
}

function handleEditHwImageUpload(input) {
    setCreateError('edit-p-hw-image', '');
    const file = input.files?.[0];
    if (!file) return;
    const validation = validateProductImageFiles([file], { required: true });
    if (!validation.valid) {
        setProductImageValidationError('edit-p-hw-image', validation);
        input.value = ''; return;
    }
    editHwImage = { file, name: file.name, url: URL.createObjectURL(file) };
    const editHwImgObj = editHwImage;
    editHwImgObj.dataPromise = Store.compressImage(file).then(d => { editHwImgObj.dataUrl = d; }).catch(() => {});
    renderEditPreview('hardware');
    renderEditHwImageStatus();
}

async function saveProduct(pid) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    const isSW = p.product_type === 'software';
    const val = id => (document.getElementById(id)?.value || '').trim();

    const isNsHw = !isSW && (p.product_format || 'standard') === 'nonstandard';

    // Basic validation
    if (!val('edit-p-name')) { showToast('Please fix the highlighted fields', 'error'); setCreateError('edit-p-name', 'Please enter Product Name.'); return; }
    if (!isNsHw && !val('edit-p-vendor')) { showToast('Please fix the highlighted fields', 'error'); setCreateError('edit-p-vendor', 'Please enter Vendor.'); return; }
    if (isSW && !getCheckedValues('edit-p-categories').length) { showToast('Please fix the highlighted fields', 'error'); setCreateError('edit-p-categories', 'Please select Category.'); return; }
    if (!isSW && (p.product_format || 'standard') === 'standard') {
        if (!val('edit-p-brand')) { showToast('Please fix the highlighted fields', 'error'); setCreateError('edit-p-brand', 'Please enter Brand.'); return; }
        if (!val('edit-p-model')) { showToast('Please fix the highlighted fields', 'error'); setCreateError('edit-p-model', 'Please enter Model.'); return; }
        const editSpecs = collectNsItems('edit-p-spec');
        if (editSpecs.length < HW_KEY_SPEC_MIN_ITEMS) { showToast(`At least ${HW_KEY_SPEC_MIN_ITEMS} specifications required`, 'error'); return; }
    }
    if (isNsHw) {
        if (collectNsItems('edit-p-platform').length + collectNsItems('edit-p-nsspec').length < HW_KEY_SPEC_MIN_ITEMS) {
            showToast(`At least ${HW_KEY_SPEC_MIN_ITEMS} items across Processor/Platform and Key Specifications`, 'error'); return;
        }
    }

    await Promise.all([
        ...editSwImages.map(img => img.dataPromise),
        editSwIcon?.dataPromise,
        editHwImage?.dataPromise,
    ].filter(Boolean));

    p.name = val('edit-p-name') || p.name;
    if (!isNsHw) p.vendor_name = val('edit-p-vendor') || p.vendor_name;
    p.updated_at = new Date().toISOString().slice(0, 10);

    if (isSW) {
        p.categories = getCheckedValues('edit-p-categories').slice(0, SW_CATEGORY_MAX);
        p.sub_category = p.categories[0] || p.sub_category;
        p.tagline = val('edit-p-tagline');
        p.features = Array.from({ length: SOFTWARE_FEATURE_MAX_ITEMS }, (_, i) => val(`edit-p-feat-${i}`)).filter(Boolean);
        p.industries = Array.from(document.querySelectorAll('#edit-p-industries input:checked')).map(cb => cb.value);
        p.compatible_hardware = Array.from(document.querySelectorAll('#edit-p-compat-hw input:checked')).map(cb => cb.value);
        const photoData = editSwImages.map(img => img.dataUrl || img.url || '').filter(Boolean);
        p.photos = editSwImages.map(img => img.name);
        p.image_name = editSwImages[0]?.name || '';
        p.photos_data = photoData;
        p.image_data = photoData[0] || '';
        p.icon_name = editSwIcon?.name || '';
        p.icon_data = editSwIcon?.dataUrl || editSwIcon?.url || '';
    } else {
        const hwFmt = p.product_format || 'standard';
        p.sub_category = val('edit-p-hw-type') || p.sub_category;
        p.is_aidaptiv = document.getElementById('edit-p-aidaptiv')?.checked || false;
        if (hwFmt === 'standard') {
            p.brand = val('edit-p-brand') || p.brand;
            p.model = val('edit-p-model') || p.model;
            p.key_specifications = collectNsItems('edit-p-spec');
        } else {
            p.ns_platforms = collectNsItems('edit-p-platform');
            p.key_specifications = collectNsItems('edit-p-nsspec');
        }
        const hwImageData = editHwImage?.dataUrl || editHwImage?.url || '';
        p.image_name = editHwImage?.name || '';
        p.photos = editHwImage ? [editHwImage.name] : [];
        p.image_data = hwImageData;
        p.photos_data = hwImageData ? [hwImageData] : [];
    }

    // Reset edit image state
    editSwImages = []; editSwIcon = null; editHwImage = null;

    // Editing a live (published) product sends it back to Draft so the
    // change must be re-published before it goes live again. Drafts /
    // archived keep their status.
    const wasPublished = p.status === 'published';
    let strippedRefs = 0;
    if (wasPublished) {
        p.status = 'draft';
        // A referenced HW reverting to Draft would leave stale SW compatibility refs;
        // strip them now (same cleanup as unpublish/archive/delete) so nothing dangles.
        if (p.product_type === 'hardware') {
            strippedRefs = findCompatRefs(p.id).length;
            if (strippedRefs) removeCompatRefs(p.id);
        }
    }

    logActivity('Updated', p.name, 'Draft updated');
    if (wasPublished) logActivity('Unpublished', p.name, 'Edited while live — moved to Draft, re-publish to go live');
    closeModal();
    showToast(wasPublished
        ? `${p.name} updated — moved to Draft${strippedRefs ? `, removed from ${strippedRefs} software` : ''}. Re-publish to make it live.`
        : `${p.name} updated`, 'success');
    // Return to wherever Edit was opened from: stay on the list when opened
    // from the list, or re-open the detail page when opened from the detail.
    if (isSW) { renderSwProducts(); if (editReturnView === 'detail') showSwDetail(pid); }
    else { renderHwProducts(); if (editReturnView === 'detail') showHwDetail(pid); }
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// PARAMETER CENTER
// ═══════════════════════════════════════════════════════════════════

function switchParamTab(tab) {
    document.querySelectorAll('.param-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('param-tab-' + tab)?.classList.remove('hidden');
    document.querySelectorAll('[data-param-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.paramTab === tab);
    });
}

function renderParamCenter() {
    renderParamPackaging();
    renderParamTagList('param-sw-categories', SOFTWARE_CATEGORY_OPTIONS, 'sw-cat');
    renderParamTagList('param-sw-industries', SOFTWARE_INDUSTRY_OPTIONS, 'sw-ind');
    renderParamTagList('param-hw-types', HARDWARE_PRODUCT_TYPES, 'hw-type');
    renderDisplayOrder('software');
    renderDisplayOrder('hardware');
}

/* ── Packaging table ── */
function renderParamPackaging() {
    const swProducts = PRODUCTS.filter(p => p.product_type === 'software');
    document.getElementById('param-sw-packaging-tbody').innerHTML = swProducts.length
        ? swProducts.map(p => {
            const isBundled = p.sw_category === 'included';
            return `<tr>
                <td>
                    <div class="flex items-center gap-3">
                        <div style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#0f173a,#1d2e7b);color:#fff;font-size:0.55rem;font-weight:800;letter-spacing:0.06em;flex-shrink:0">${esc(p.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2))}</div>
                        <div>
                            <div class="font-bold text-[#1d1d1f] text-sm">${esc(p.name)}</div>
                            <div class="text-xs text-[#86868b]">${esc(p.sub_category || '')}</div>
                        </div>
                    </div>
                </td>
                <td class="text-sm">${esc(p.vendor_name)}</td>
                <td>${statusBadge(p.status)}</td>
                <td>
                    <select class="border border-[#e8eaed] rounded-lg px-3 py-1.5 text-sm bg-white focus:border-aiso focus:outline-none cursor-pointer font-semibold ${isBundled ? 'text-emerald-700' : 'text-[#1d1d1f]'}"
                            onchange="updateSwPackaging('${p.id}', this.value)">
                        <option value="included" ${isBundled ? 'selected' : ''}>Bundled</option>
                        <option value="optional" ${!isBundled ? 'selected' : ''}>Add-on</option>
                    </select>
                </td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="4" class="py-8">${emptyState('ph-app-window', EMPTY_STATE_NO_DATA)}</td></tr>`;
}

function updateSwPackaging(pid, value) {
    const p = PRODUCTS.find(x => x.id === pid);
    if (!p) return;
    p.sw_category = value;
    Store.save();
    renderParamPackaging();
    showToast(`${p.name} updated to ${value === 'included' ? 'Bundled' : 'Add-on'}`);
}

/* ── Generic inline tag list ── */
function renderParamTagList(containerId, dataArr, prefix) {
    const target = document.getElementById(containerId);
    if (!target) return;
    const activeCount = dataArr.filter(o => o.is_active).length;
    const totalCount = dataArr.length;
    target.innerHTML = `
        <div class="flex items-center gap-2 mb-3">
            <span class="text-xs text-[#86868b] font-bold">${activeCount} active / ${totalCount} total</span>
        </div>
        <div class="flex flex-wrap gap-2 mb-4">
            ${dataArr.map((item, idx) => `
                <div class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition
                    ${item.is_active
                        ? 'bg-white border-[#e8eaed] text-[#1d1d1f]'
                        : 'bg-[#fafbfc] border-dashed border-[#e8eaed] text-[#86868b] line-through'}">
                    <span>${esc(item.label)}</span>
                    <button type="button" class="ml-1 w-5 h-5 rounded-full flex items-center justify-center text-xs transition
                        ${item.is_active
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-red-50 hover:text-red-500'
                            : 'bg-[#f5f5f7] text-[#86868b] hover:bg-emerald-50 hover:text-emerald-600'}"
                        onclick="toggleParamTag('${prefix}', ${idx})"
                        title="${item.is_active ? 'Disable' : 'Enable'}">
                        <i class="ph ${item.is_active ? 'ph-check' : 'ph-arrow-counter-clockwise'}" style="font-size:10px"></i>
                    </button>
                    <button type="button" class="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-[#f5f5f7] text-[#86868b] hover:bg-red-50 hover:text-red-500 transition"
                        onclick="confirmDeleteParamTag('${prefix}', ${idx})"
                        title="Delete">
                        <i class="ph ph-trash" style="font-size:10px"></i>
                    </button>
                </div>
            `).join('')}
        </div>
        <div class="flex items-center gap-2">
            <div class="relative flex-1 max-w-xs">
                <input id="${prefix}-new-input" type="text" maxlength="50" placeholder="Add new item..."
                    class="border border-[#e8eaed] rounded-lg px-3 py-1.5 pr-14 text-sm w-full focus:border-aiso focus:outline-none"
                    oninput="updateCharCounter('${prefix}-new-input')"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();addParamTag('${prefix}')}">
                <span id="${prefix}-new-input-count" class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#86868b] pointer-events-none">0/50</span>
            </div>
            <button type="button" class="btn-primary py-1.5 px-3 text-xs" onclick="addParamTag('${prefix}')">
                <i class="ph ph-plus"></i> Add
            </button>
        </div>`;
}

function getParamDataArr(prefix) {
    if (prefix === 'sw-cat') return SOFTWARE_CATEGORY_OPTIONS;
    if (prefix === 'sw-ind') return SOFTWARE_INDUSTRY_OPTIONS;
    if (prefix === 'hw-type') return HARDWARE_PRODUCT_TYPES;
    return [];
}

function getParamContainerId(prefix) {
    if (prefix === 'sw-cat') return 'param-sw-categories';
    if (prefix === 'sw-ind') return 'param-sw-industries';
    if (prefix === 'hw-type') return 'param-hw-types';
    return '';
}

function toggleParamTag(prefix, idx) {
    const arr = getParamDataArr(prefix);
    if (!arr[idx]) return;
    arr[idx].is_active = !arr[idx].is_active;
    Store.save();
    renderParamTagList(getParamContainerId(prefix), arr, prefix);
    showToast(`"${arr[idx].label}" ${arr[idx].is_active ? 'enabled' : 'disabled'}`);
}

function addParamTag(prefix) {
    const input = document.getElementById(prefix + '-new-input');
    const value = (input?.value || '').trim();
    if (!value) return;
    const arr = getParamDataArr(prefix);
    if (arr.some(o => o.label.toLowerCase() === value.toLowerCase())) {
        showToast('This item already exists', 'warning');
        return;
    }
    arr.push({ label: value, is_active: true });
    input.value = '';
    Store.save();
    renderParamTagList(getParamContainerId(prefix), arr, prefix);
    showToast(`${value} has been added successfully.`);
}

// Products currently using a given parameter value (so delete can warn / clean up).
function findParamTagUsage(prefix, label) {
    if (prefix === 'sw-cat') {
        return PRODUCTS.filter(p => p.product_type === 'software'
            && ((p.categories || []).includes(label) || p.sub_category === label));
    }
    if (prefix === 'sw-ind') {
        return PRODUCTS.filter(p => p.product_type === 'software' && (p.industries || []).includes(label));
    }
    if (prefix === 'hw-type') {
        return PRODUCTS.filter(p => p.product_type === 'hardware' && p.sub_category === label);
    }
    return [];
}

// Strip a parameter value from every product that references it.
function removeParamTagFromProducts(prefix, label) {
    findParamTagUsage(prefix, label).forEach(p => {
        if (prefix === 'sw-cat') {
            p.categories = (p.categories || []).filter(c => c !== label);
            if (p.sub_category === label) p.sub_category = p.categories[0] || '';
        } else if (prefix === 'sw-ind') {
            p.industries = (p.industries || []).filter(i => i !== label);
        } else if (prefix === 'hw-type') {
            if (p.sub_category === label) p.sub_category = '';
        }
        p.updated_at = new Date().toISOString().slice(0, 10);
    });
}

function confirmDeleteParamTag(prefix, idx) {
    const arr = getParamDataArr(prefix);
    const item = arr[idx];
    if (!item) return;
    const used = findParamTagUsage(prefix, item.label);
    // Not referenced anywhere → delete straight away.
    if (!used.length) { doDeleteParamTag(prefix, idx); return; }
    // In use → same orange warning pattern as the hardware compatibility conflict modal.
    const refNames = used.map(p => esc(p.name)).join('<br>');
    showModal(`
        <div style="text-align:center;padding:1rem 0">
            <div style="width:56px;height:56px;border-radius:16px;background:#fff7ed;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="ph ph-warning-circle" style="font-size:28px;color:#d97706"></i></div>
            <h3 style="font-size:1.1rem;font-weight:700;margin:0 0 8px">Delete "${esc(item.label)}"?</h3>
            <p style="font-size:13px;color:#86868b;margin:0 0 12px;line-height:1.6">This value is currently used by:</p>
            <div style="font-size:13px;font-weight:600;color:#1d1d1f;margin:0 0 12px;line-height:1.8">${refNames}</div>
            <p style="font-size:13px;color:#86868b;margin:0 0 24px;line-height:1.6">Proceeding will remove it from those products.</p>
            <div style="display:flex;gap:10px;justify-content:center">
                <button onclick="closeModal()" class="btn-secondary">Cancel</button>
                <button onclick="doDeleteParamTag('${prefix}', ${idx}, true)" class="btn-primary" style="background:#d97706"><i class="ph ph-warning-circle"></i> Delete Anyway</button>
            </div>
        </div>`);
}

function doDeleteParamTag(prefix, idx, force = false) {
    const arr = getParamDataArr(prefix);
    const item = arr[idx];
    if (!item) return;
    const label = item.label;
    if (force) removeParamTagFromProducts(prefix, label);
    arr.splice(idx, 1);
    Store.save();
    closeModal();
    renderParamTagList(getParamContainerId(prefix), arr, prefix);
    showToast(`${label} has been deleted successfully.`);
}

/* ── Display Order ── */
function renderDisplayOrder(type) {
    const containerId = type === 'software' ? 'param-sw-order' : 'param-hw-order';
    const target = document.getElementById(containerId);
    if (!target) return;
    const items = PRODUCTS
        .filter(p => p.product_type === type)
        .sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
    if (!items.length) {
        target.innerHTML = `<div class="py-8">${emptyState(type === 'software' ? 'ph-app-window' : 'ph-hard-drives', EMPTY_STATE_NO_DATA)}</div>`;
        return;
    }
    const publishedItems = items.filter(p => p.status === 'published');
    const otherItems = items.filter(p => p.status !== 'published');
    const sortedAll = [...publishedItems, ...otherItems];
    // Reassign display_order based on sorted position
    sortedAll.forEach((p, i) => { p.display_order = i + 1; });

    target.innerHTML = `<div class="order-list">${sortedAll.map((p, idx) => {
        const isDraft = p.status !== 'published';
        const isPublished = !isDraft;
        const icon = type === 'software'
            ? `<div style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#0f173a,#1d2e7b);color:#fff;font-size:0.55rem;font-weight:800;letter-spacing:0.06em;flex-shrink:0">${esc(p.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2))}</div>`
            : `<div style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:#f5f5f7;flex-shrink:0"><i class="ph ph-hard-drives" style="font-size:16px;color:#86868b"></i></div>`;
        const dragAttrs = isPublished
            ? ` draggable="true" ondragstart="onOrderDragStart(event,'${type}','${p.id}')" ondragover="onOrderDragOver(event)" ondragleave="onOrderDragLeave(event)" ondrop="onOrderDrop(event,'${type}','${p.id}')" ondragend="onOrderDragEnd(event)"`
            : '';
        return `<div class="order-item${isDraft ? ' is-draft' : ' is-draggable'}"${dragAttrs}>
            ${isPublished ? '<span class="order-grip" title="Drag to reorder"><i class="ph ph-dots-six-vertical" style="font-size:16px"></i></span>' : '<span class="order-grip" style="visibility:hidden"><i class="ph ph-dots-six-vertical" style="font-size:16px"></i></span>'}
            <div class="order-rank">${isPublished ? idx + 1 : '—'}</div>
            ${icon}
            <div class="order-product-info">
                <div class="order-product-name">${esc(p.name)}</div>
                <div class="order-product-sub">${esc(p.vendor_name || '—')} · ${esc(p.sub_category || '')}${isDraft ? ' · <span style="color:#f59e0b;font-weight:600">' + esc(p.status.charAt(0).toUpperCase() + p.status.slice(1)) + '</span>' : ''}</div>
            </div>
            ${statusBadge(p.status)}
        </div>`;
    }).join('')}</div>`;
}

/* ── Display Order drag-and-drop ── */
let orderDragPid = null;

function onOrderDragStart(e, type, pid) {
    orderDragPid = pid;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', pid); } catch (err) { /* ignore */ }
    e.currentTarget.classList.add('is-dragging');
}

function onOrderDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function onOrderDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function onOrderDragEnd(e) {
    e.currentTarget.classList.remove('is-dragging');
    document.querySelectorAll('.order-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    orderDragPid = null;
}

function onOrderDrop(e, type, targetPid) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const pid = orderDragPid;
    orderDragPid = null;
    if (!pid || pid === targetPid) return;
    const published = PRODUCTS
        .filter(p => p.product_type === type && p.status === 'published')
        .sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
    const fromIdx = published.findIndex(p => p.id === pid);
    const toIdx = published.findIndex(p => p.id === targetPid);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = published.splice(fromIdx, 1);
    published.splice(toIdx, 0, moved);
    const others = PRODUCTS
        .filter(p => p.product_type === type && p.status !== 'published')
        .sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
    [...published, ...others].forEach((p, i) => { p.display_order = i + 1; });
    logActivity('Reordered', moved.name, `Reordered to position ${toIdx + 1}`, moved.id);
    renderDisplayOrder(type);
    showToast('Product order updated.');
}

function renderSettings() {
    document.getElementById('settings-name').value = currentUser.name;
    document.getElementById('settings-email').value = currentUser.email;
    document.getElementById('settings-role').value = 'Super Admin (unrestricted cross-org access)';
}

function confirmResetDemoData() {
    showModal(`
        <div style="text-align:center;padding:1rem 0">
            <div style="width:56px;height:56px;border-radius:16px;background:#fef2f2;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="ph ph-arrow-counter-clockwise" style="font-size:28px;color:#dc2626"></i></div>
            <h3 style="font-size:1.1rem;font-weight:700;margin:0 0 8px">Reset demo data?</h3>
            <p style="font-size:13px;color:#86868b;margin:0 0 20px;line-height:1.6">This clears all locally saved changes and restores the original demo data. The page will reload.</p>
            <div style="display:flex;gap:10px;justify-content:center">
                <button onclick="closeModal()" class="btn-secondary">Cancel</button>
                <button onclick="Store.reset()" class="btn-primary" style="background:#dc2626"><i class="ph ph-arrow-counter-clockwise"></i> Reset Demo Data</button>
            </div>
        </div>`);
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT HISTORY (per-product timeline)
// ═══════════════════════════════════════════════════════════════════

const HISTORY_PAGE_SIZE = 5;

function renderProductHistory(p) {
    if (!p.history || !p.history.length) return '';
    const actionColors = {
        'Created': '#2563eb', 'Updated': '#1d1d1f', 'Published': '#059669',
        'Unpublished': '#d97706', 'Archived': '#7c3aed', 'Restored': '#059669', 'Deleted': '#dc2626',
    };
    const actionIcons = {
        'Created': 'ph-plus-circle', 'Updated': 'ph-pencil-simple', 'Published': 'ph-rocket-launch',
        'Unpublished': 'ph-arrow-line-down', 'Archived': 'ph-archive', 'Restored': 'ph-arrow-counter-clockwise', 'Deleted': 'ph-trash',
    };
    return `
        <div class="product-history-section" style="border-top:1px solid var(--border-light);margin-top:32px;padding-top:32px">
            <div style="font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px">History</div>
            <div style="display:flex;flex-direction:column;gap:0;position:relative;padding-left:20px">
                <div style="position:absolute;left:7px;top:6px;bottom:6px;width:1px;background:var(--border-light)"></div>
                ${p.history.map((h, i) => {
                    const color = actionColors[h.action] || '#86868b';
                    const icon = actionIcons[h.action] || 'ph-info';
                    const d = new Date(h.timestamp);
                    const timeStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const hidden = i >= HISTORY_PAGE_SIZE;
                    return `<div class="history-entry${hidden ? ' history-entry-hidden' : ''}" style="display:${hidden ? 'none' : 'flex'};align-items:flex-start;gap:12px;padding:8px 0;position:relative">
                        <div style="position:absolute;left:-20px;top:10px;width:15px;height:15px;border-radius:50%;background:#fff;border:2px solid ${color};display:flex;align-items:center;justify-content:center;z-index:1"><i class="ph ${icon}" style="font-size:8px;color:${color}"></i></div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:600;color:${color}">${esc(h.action)}${h.detail ? ' <span style="font-weight:400;color:#86868b">· ' + esc(h.detail) + '</span>' : ''}</div>
                            <div style="font-size:11px;color:#c7c7cc;margin-top:2px">${esc(h.user || 'System')} · ${timeStr}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            ${p.history.length > HISTORY_PAGE_SIZE ? `
            <div style="margin-top:12px;padding-left:20px">
                <button type="button" class="btn-ghost" style="font-size:12px" onclick="showMoreProductHistory(this)"><i class="ph ph-caret-down"></i> More (${p.history.length - HISTORY_PAGE_SIZE})</button>
            </div>` : ''}
        </div>`;
}

function showMoreProductHistory(btn) {
    const root = btn.closest('.product-history-section');
    if (!root) return;
    root.querySelectorAll('.history-entry-hidden').forEach(el => {
        el.classList.remove('history-entry-hidden');
        el.style.display = 'flex';
    });
    btn.parentElement.remove();
}

// ═══════════════════════════════════════════════════════════════════
// ACTIVITY LOG (global)
// ═══════════════════════════════════════════════════════════════════

function renderActivityLog() {
    const target = document.getElementById('activity-log-list');
    if (!target) return;
    if (!ACTIVITY_LOG.length) {
        target.innerHTML = `<div style="padding:32px 0">${emptyState(
            'ph-clock-counter-clockwise',
            EMPTY_STATE_NO_DATA,
            '<div style="font-size:12px;color:#c7c7cc;margin-top:4px">Actions like publish, archive, and delete will appear here.</div>'
        )}</div>`;
        return;
    }
    const actionIcons = {
        'Published': { icon: 'ph-rocket-launch', color: '#059669', bg: '#ecfdf5' },
        'Unpublished': { icon: 'ph-arrow-line-down', color: '#d97706', bg: '#fff7ed' },
        'Archived': { icon: 'ph-archive', color: '#7c3aed', bg: '#f3f0ff' },
        'Restored': { icon: 'ph-arrow-counter-clockwise', color: '#059669', bg: '#ecfdf5' },
        'Deleted': { icon: 'ph-trash', color: '#dc2626', bg: '#fef2f2' },
        'Created': { icon: 'ph-plus-circle', color: '#2563eb', bg: '#eff6ff' },
        'Updated': { icon: 'ph-pencil-simple', color: '#1d1d1f', bg: '#f5f5f7' },
    };
    target.innerHTML = `<div style="border:1px solid var(--border-light);border-radius:12px;overflow:hidden">${ACTIVITY_LOG.map((log, i) => {
        const a = actionIcons[log.action] || { icon: 'ph-info', color: '#86868b', bg: '#f5f5f7' };
        const time = new Date(log.timestamp);
        const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;${i < ACTIVITY_LOG.length - 1 ? 'border-bottom:1px solid var(--border-light)' : ''};background:${i % 2 === 0 ? '#fff' : '#fafbfc'}">
            <div style="width:34px;height:34px;border-radius:10px;background:${a.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ph ${a.icon}" style="font-size:16px;color:${a.color}"></i></div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13.5px;font-weight:600;color:#1d1d1f"><span style="color:${a.color}">${esc(log.action)}</span> · ${esc(log.productName)}</div>
                ${log.detail ? `<div style="font-size:12px;color:#86868b;margin-top:1px">${esc(log.detail)}</div>` : ''}
            </div>
            <div style="font-size:11px;color:#c7c7cc;font-weight:500;flex-shrink:0;font-variant-numeric:tabular-nums">${timeStr}</div>
        </div>`;
    }).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════

// Keyboard shortcuts
function toggleUserMenu(e) {
    if (e) e.stopPropagation();
    const dd = document.getElementById('user-menu-dropdown');
    const caret = document.getElementById('user-menu-caret');
    if (!dd) return;
    const open = dd.style.display !== 'block';
    dd.style.display = open ? 'block' : 'none';
    if (caret) caret.style.transform = open ? 'rotate(180deg)' : '';
}
function closeUserMenu() {
    const dd = document.getElementById('user-menu-dropdown');
    const caret = document.getElementById('user-menu-caret');
    if (dd) dd.style.display = 'none';
    if (caret) caret.style.transform = '';
}

// Close the account menu on outside click / Escape
document.addEventListener('click', e => {
    if (!e.target.closest('#user-menu-btn') && !e.target.closest('#user-menu-dropdown')) closeUserMenu();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('user-menu-dropdown')?.style.display === 'block') closeUserMenu();
        else if (sdBackdrop?.classList.contains('is-open')) closeSwPreview();
        else if (document.getElementById('modal-root').innerHTML) closeModal();
    }
});

initPortal();
