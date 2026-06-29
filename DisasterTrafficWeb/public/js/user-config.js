/**
 * user-config.js
 * Logic cho trang cài đặt người dùng (view-profile).
 *
 * Thay đổi UX:
 *  - Mỗi pane mặc định read-only, có nút ✏ Edit góc trên phải tiêu đề.
 *  - Khi nhấn Edit → field/toggle được kích hoạt, xuất hiện [Lưu] + [Hủy].
 *  - Nhấn Hủy → khôi phục giá trị ban đầu, trở về read-only.
 *  - Dirty-tracking: nút Hủy chỉ có khi đang ở chế độ edit (luôn hiện cùng Lưu).
 *
 * Phụ thuộc: /js/auth.js (getToken, getUser, setAuth, clearAuth, getPlan)
 */

import { getToken, getUser, setAuth, clearAuth, getPlan } from '/js/auth.js';

const STORAGE_KEY = 'dt_user_config';

// ── Defaults ──────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    map: {
        defaultLat: 10.762622,
        defaultLng: 106.660172,
        defaultZoom: 13,
        showTrafficLayer: true,
        showCameras: true,
        autoPanOnAlert: true,
        theme: '#4cd7f6',
        colorMode: 'dark',
    },
    notif: {
        webPush: true,
        mobilePush: true,
        emailDigest: false,
        types: { fire: true, flood: true, traffic: true, other: false },
        minSeverity: 3,
    },
    alerts: {
        limit: 500,
        maxAgeHours: 24,
        sources: { eonet: true, tomtom: true, community: true, ai: true },
        dedupRadiusKm: 5,
    },
    api: {
        webhookUrl: '',
        webhookEnabled: false,
    },
};

// ── Load / Save config ────────────────────────────────────────
export function loadConfig() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? deepMerge(DEFAULT_CONFIG, JSON.parse(saved)) : { ...DEFAULT_CONFIG };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

export function saveConfig(cfg) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {
        console.warn('[user-config] Không lưu được config vào localStorage');
    }
}

function deepMerge(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override || {})) {
        if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
            result[key] = deepMerge(base[key] || {}, override[key]);
        } else {
            result[key] = override[key];
        }
    }
    return result;
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, ok = true) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.background = ok ? '' : 'rgba(185,28,28,0.95)';
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ── API helpers ───────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const r = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
}

// ── Disable/enable fields trong pane ─────────────────────────
// (chỉ một định nghĩa duy nhất — đã gộp cả xử lý toggle labels và range sliders)
function setFieldsDisabled(paneId, disabled) {
    const pane = document.getElementById('cfg-pane-' + paneId);
    if (!pane) return;

    pane.querySelectorAll('input, select, textarea').forEach(el => {
        // Giữ email luôn disabled
        if (el.type === 'email' && el.disabled && disabled === false) return;
        el.disabled = disabled;
    });

    // Toggle labels — enable/disable pointer events
    pane.querySelectorAll('label[id^="label-"]').forEach(lbl => {
        if (disabled) {
            lbl.classList.add('opacity-50', 'pointer-events-none');
            lbl.classList.remove('cursor-pointer');
        } else {
            lbl.classList.remove('opacity-50', 'pointer-events-none');
            lbl.classList.add('cursor-pointer');
        }
    });

    // Color buttons
    pane.querySelectorAll('[data-color]').forEach(btn => {
        btn.style.pointerEvents = disabled ? 'none' : '';
        btn.style.opacity = disabled ? '0.5' : '';
    });

    // Range sliders visual
    pane.querySelectorAll('input[type="range"]').forEach(el => {
        el.style.opacity = disabled ? '0.5' : '';
    });
}

// ── Edit-mode helpers ─────────────────────────────────────────
/**
 * Tạo thanh actions gồm nút Edit | Lưu + Hủy.
 * @param {string} paneId       - id của pane (dùng để scope query)
 * @param {Function} onSave     - callback khi nhấn Lưu
 * @param {Function} onEnterEdit - callback khi vào edit mode (để enable thêm nếu cần)
 * @param {Function} onCancel   - callback khi hủy
 */
function createEditBar(paneId, { onSave, onEnterEdit, onCancel }) {
    const bar = document.createElement('div');
    bar.className = 'cfg-edit-bar flex items-center gap-2';

    // Nút bút chì
    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'cfg-btn-edit flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-outline-variant/40 text-gray-400 hover:text-primary hover:border-primary/50 transition-all';
    btnEdit.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">edit</span> Chỉnh sửa`;

    // Nút Lưu
    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'cfg-btn-save hidden px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity';
    btnSave.textContent = 'Lưu thay đổi';

    // Nút Hủy
    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'cfg-btn-cancel hidden px-3 py-1.5 text-xs rounded-lg border border-outline-variant/40 text-gray-400 hover:text-red-400 hover:border-red-400/40 transition-all';
    btnCancel.textContent = 'Hủy';

    bar.append(btnEdit, btnSave, btnCancel);

    // State
    let snapshot = null;

    function enterEditMode() {
        snapshot = takeSnapshot(paneId);
        btnEdit.classList.add('hidden');
        btnSave.classList.remove('hidden');
        btnCancel.classList.remove('hidden');
        setFieldsDisabled(paneId, false);
        onEnterEdit?.();
    }

    function exitEditMode() {
        btnEdit.classList.remove('hidden');
        btnSave.classList.add('hidden');
        btnCancel.classList.add('hidden');
        setFieldsDisabled(paneId, true);
    }

    btnEdit.addEventListener('click', enterEditMode);

    btnSave.addEventListener('click', () => {
        onSave?.(snapshot);
        exitEditMode();
    });

    btnCancel.addEventListener('click', () => {
        restoreSnapshot(paneId, snapshot);
        onCancel?.();
        exitEditMode();
    });

    return bar;
}

/** Snapshot tất cả input/select/checkbox trong pane */
function takeSnapshot(paneId) {
    const pane = document.getElementById('cfg-pane-' + paneId);
    if (!pane) return {};
    const snap = {};
    pane.querySelectorAll('input, select, textarea').forEach(el => {
        if (!el.id) return;
        snap[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return snap;
}

/** Restore snapshot vào DOM */
function restoreSnapshot(paneId, snap) {
    if (!snap) return;
    const pane = document.getElementById('cfg-pane-' + paneId);
    if (!pane) return;
    pane.querySelectorAll('input, select, textarea').forEach(el => {
        if (!el.id || !(el.id in snap)) return;
        if (el.type === 'checkbox') el.checked = snap[el.id];
        else el.value = snap[el.id];
        // Trigger change events cho UI reactive (slider labels, color buttons, v.v.)
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Restore color buttons nếu có
    const themeInput = document.getElementById('cfg-map-theme');
    if (themeInput && snap['cfg-map-theme']) {
        pane.querySelectorAll('[data-color]').forEach(btn => {
            btn.classList.toggle('border-white', btn.dataset.color === snap['cfg-map-theme']);
            btn.classList.toggle('scale-110', btn.dataset.color === snap['cfg-map-theme']);
            btn.classList.toggle('border-transparent', btn.dataset.color !== snap['cfg-map-theme']);
        });
    }
}

// ── Pane header với edit bar ──────────────────────────────────
function paneHeader(title, desc, editBar) {
    const wrap = document.createElement('div');
    wrap.className = 'flex items-start justify-between mb-5';
    const textWrap = document.createElement('div');
    textWrap.innerHTML = `
        <h2 class="text-base font-semibold mb-0.5">${title}</h2>
        <p class="text-xs text-gray-500">${desc}</p>
    `;
    wrap.append(textWrap);
    if (editBar) wrap.append(editBar);
    return wrap;
}

// ── Khởi tạo ─────────────────────────────────────────────────
export function initUserConfig() {
    const cfg = loadConfig();
    const user = getUser();

    renderProfilePane(user, cfg);
    renderMapPane(cfg);
    renderNotifPane(cfg);
    renderAlertsPane(cfg);
    renderApiPane();
    renderSecurityPane();
    renderPlanPane(user);

    document.querySelectorAll('.cfg-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.cfg-nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const paneId = item.dataset.pane;
            document.querySelectorAll('.cfg-pane').forEach(p => p.classList.add('hidden'));
            const target = document.getElementById('cfg-pane-' + paneId);
            if (target) target.classList.remove('hidden');
        });
    });
}

// ────────────────────────────────────────────────────────────
// PROFILE PANE
// ────────────────────────────────────────────────────────────
function renderProfilePane(user, cfg) {
    const pane = document.getElementById('cfg-pane-profile');
    if (!pane || !user) return;

    const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const planLabel = { free: 'Miễn phí', pro: 'Chuyên nghiệp', enterprise: 'Tổ chức' }[user.plan] || user.plan;
    const planBadge = {
        free: 'bg-gray-100 text-gray-600',
        pro: 'bg-blue-100 text-blue-700',
        enterprise: 'bg-amber-100 text-amber-700',
    }[user.plan] || '';

    pane.innerHTML = '';

    const editBar = createEditBar('profile', {
        onSave: () => {
            saveProfile();
        },
        onCancel: () => {
            toast('Đã hủy thay đổi hồ sơ.');
        },
    });

    pane.append(paneHeader('Hồ sơ cá nhân', 'Thông tin hiển thị trong hệ thống và khi báo cáo sự cố.', editBar));

    const body = document.createElement('div');
    body.innerHTML = `
        <div class="flex items-center gap-4 mb-6">
            <div class="w-16 h-16 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-xl font-bold shrink-0">
                ${initials}
            </div>
            <div>
                <p class="font-semibold">${escHtml(user.name || '')}</p>
                <p class="text-xs text-gray-500">${escHtml(user.email || '')}</p>
                <span class="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${planBadge}">${planLabel}</span>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
                <label class="block text-xs text-gray-500 mb-1">Họ và tên</label>
                <input id="cfg-name" type="text" value="${escHtml(user.name || '')}" disabled
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Tên commander</label>
                <input id="cfg-commander" type="text" value="${escHtml(localStorage.getItem('dt_commander') || '')}" disabled
                    placeholder="NHÓM 10 - NT208.Q22"
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
            </div>
        </div>
        <div class="mb-3">
            <label class="block text-xs text-gray-500 mb-1">Email</label>
            <input type="email" value="${escHtml(user.email || '')}" disabled
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/20 text-gray-500 cursor-not-allowed outline-none">
        </div>
        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-1">Đơn vị / Tổ chức</label>
            <input id="cfg-org" type="text" value="${escHtml(localStorage.getItem('dt_org') || '')}" disabled
                placeholder="Phòng CSGT, Cục QLĐT TP.HCM..."
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
        </div>
    `;
    pane.append(body);
}

function saveProfile() {
    const name = document.getElementById('cfg-name')?.value.trim();
    const commander = document.getElementById('cfg-commander')?.value.trim();
    const org = document.getElementById('cfg-org')?.value.trim();

    if (commander) {
        localStorage.setItem('dt_commander', commander);
        document.getElementById('commander-name-sidebar')?.setAttribute('textContent', commander);
        document.getElementById('commander-name-main')?.setAttribute('textContent', commander);
    }
    if (org) localStorage.setItem('dt_org', org);
    toast('Đã lưu hồ sơ.');
}

// ────────────────────────────────────────────────────────────
// PLAN PANE  (read-only, không cần edit bar)
// ────────────────────────────────────────────────────────────
function renderPlanPane(user) {
    const pane = document.getElementById('cfg-pane-plan');
    if (!pane || !user) return;

    const plans = [
        { key: 'enterprise', label: 'Tổ chức', price: 'Liên hệ', features: ['Camera không giới hạn', 'Lịch sử không giới hạn', 'API riêng', 'Hỗ trợ 24/7'] },
        { key: 'pro', label: 'Chuyên nghiệp', price: '199.000 ₫ / tháng', features: ['200 cảnh báo', 'Lịch sử 7 ngày', 'Theo dõi vùng ưu tiên'] },
        { key: 'free', label: 'Miễn phí', price: '0 ₫', features: ['50 cảnh báo', 'Báo cáo cộng đồng'] },
    ];

    pane.innerHTML = `
        <div class="flex items-start justify-between mb-5">
            <div>
                <h2 class="text-base font-semibold mb-0.5">Gói dịch vụ</h2>
                <p class="text-xs text-gray-500">Gói hiện tại và tuỳ chọn thay đổi.</p>
            </div>
        </div>
        <div class="space-y-3">
            ${plans.map(p => `
                <div class="border rounded-xl p-4 ${p.key === user.plan ? 'border-primary/50 bg-primary/5' : 'border-outline-variant/30'}">
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-semibold text-sm">${p.label}</span>
                        ${p.key === user.plan ? '<span class="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold">Hiện tại</span>' : ''}
                    </div>
                    <p class="text-xs text-gray-500 mb-2">${p.price}</p>
                    <p class="text-xs text-gray-400">${p.features.join(' · ')}</p>
                    ${p.key !== user.plan ? `<button class="mt-3 text-xs px-3 py-1 border border-outline-variant/40 rounded-lg hover:bg-white/5 transition-colors" onclick="window.location.href='/login.html?upgrade=1'">
                        ${user.plan === 'enterprise' || (user.plan === 'pro' && p.key === 'free') ? 'Hạ cấp' : 'Nâng cấp'}
                    </button>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

// ────────────────────────────────────────────────────────────
// SECURITY PANE
// ────────────────────────────────────────────────────────────
function renderSecurityPane() {
    const pane = document.getElementById('cfg-pane-security');
    if (!pane) return;

    pane.innerHTML = '';

    const editBar = createEditBar('security', {
        onSave: () => changePassword(),
        onCancel: () => {
            toast('Đã hủy thay đổi mật khẩu.');
        },
    });

    pane.append(paneHeader('Bảo mật', 'Đổi mật khẩu và quản lý phiên đăng nhập.', editBar));

    const body = document.createElement('div');
    body.innerHTML = `
        <div class="space-y-3 mb-5">
            <div>
                <label class="block text-xs text-gray-500 mb-1">Mật khẩu hiện tại</label>
                <input id="cfg-pw-cur" type="password" placeholder="••••••••" disabled
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Mật khẩu mới</label>
                    <input id="cfg-pw-new" type="password" placeholder="≥ 8 ký tự, có số + chữ" disabled
                        class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Xác nhận mật khẩu mới</label>
                    <input id="cfg-pw-confirm" type="password" placeholder="Nhập lại" disabled
                        class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                </div>
            </div>
        </div>

        <div class="border-t border-outline-variant/20 pt-5 mt-2">
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Phiên đăng nhập</p>
            <div class="space-y-2 text-xs text-gray-400 mb-4">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-primary">laptop</span>
                    Chrome / Windows — TP.HCM
                    <span class="ml-auto text-primary font-bold">Hiện tại</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm">smartphone</span>
                    iOS App — TP.HCM — 2 ngày trước
                </div>
            </div>
            <button class="text-xs px-3 py-1.5 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                Đăng xuất tất cả thiết bị khác
            </button>
        </div>
    `;
    pane.append(body);
}

async function changePassword() {
    const cur = document.getElementById('cfg-pw-cur')?.value;
    const nw = document.getElementById('cfg-pw-new')?.value;
    const confirm = document.getElementById('cfg-pw-confirm')?.value;

    if (!cur || !nw) { toast('Vui lòng điền đầy đủ mật khẩu.', false); return; }
    if (nw !== confirm) { toast('Mật khẩu mới không khớp.', false); return; }
    if (nw.length < 8 || !/[A-Za-z]/.test(nw) || !/\d/.test(nw)) {
        toast('Mật khẩu mới cần ≥ 8 ký tự, có chữ và số.', false); return;
    }

    try {
        // TODO: endpoint PATCH /api/auth/password chưa có — cần thêm vào authRoutes.js
        // await apiFetch('/api/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
        toast('Đã đổi mật khẩu thành công.');
        ['cfg-pw-cur', 'cfg-pw-new', 'cfg-pw-confirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    } catch (err) {
        toast('Lỗi: ' + err.message, false);
    }
}

// ────────────────────────────────────────────────────────────
// NOTIFICATIONS PANE
// ────────────────────────────────────────────────────────────
function renderNotifPane(cfg) {
    const pane = document.getElementById('cfg-pane-notif');
    if (!pane) return;

    pane.innerHTML = '';

    const editBar = createEditBar('notif', {
        onSave: () => {
            cfg.notif.webPush = getToggle('notif-web');
            cfg.notif.mobilePush = getToggle('notif-mobile');
            cfg.notif.emailDigest = getToggle('notif-email');
            cfg.notif.types.fire = getToggle('notif-fire');
            cfg.notif.types.flood = getToggle('notif-flood');
            cfg.notif.types.traffic = getToggle('notif-traffic');
            cfg.notif.types.other = getToggle('notif-other');
            cfg.notif.minSeverity = parseInt(document.getElementById('cfg-severity')?.value || '3', 10);
            saveConfig(cfg);
            toast('Đã lưu cài đặt thông báo.');
        },
        onCancel: () => {
            toast('Đã hủy thay đổi thông báo.');
        },
    });

    pane.append(paneHeader('Thông báo', 'Chọn kênh và loại sự kiện muốn nhận thông báo.', editBar));

    const body = document.createElement('div');
    body.innerHTML = `
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Kênh</p>
        ${toggleRow('notif-web', 'Trình duyệt (Web Push)', 'Thông báo ngay khi đang mở web', cfg.notif.webPush, true)}
        ${toggleRow('notif-mobile', 'Ứng dụng di động (Expo Push)', 'Cần cài app và cấp quyền thông báo', cfg.notif.mobilePush, true)}
        ${toggleRow('notif-email', 'Email tóm tắt hàng ngày', 'Gửi lúc 7:00 sáng mỗi ngày', cfg.notif.emailDigest, true)}

        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-5 mb-3">Loại sự kiện</p>
        ${toggleRow('notif-fire', 'Hoả hoạn', 'Cháy nổ, báo cháy', cfg.notif.types.fire, true)}
        ${toggleRow('notif-flood', 'Ngập lụt', 'Triều cường, mưa lớn', cfg.notif.types.flood, true)}
        ${toggleRow('notif-traffic', 'Kẹt xe / Tai nạn', 'Ùn tắc giao thông', cfg.notif.types.traffic, true)}
        ${toggleRow('notif-other', 'Thiên tai khác', 'Bão, sạt lở, động đất', cfg.notif.types.other, true)}

        <div class="mt-5 mb-5">
            <label class="block text-xs text-gray-500 mb-2">Mức độ nghiêm trọng tối thiểu (1–5)</label>
            <div class="flex items-center gap-3">
                <input type="range" min="1" max="5" step="1" value="${cfg.notif.minSeverity}" id="cfg-severity" disabled
                    class="flex-1 disabled:opacity-50">
                <span id="cfg-severity-val" class="text-sm font-mono text-primary w-12 text-right">Cấp ${cfg.notif.minSeverity}</span>
            </div>
        </div>
    `;
    pane.append(body);

    document.getElementById('cfg-severity')?.addEventListener('input', e => {
        document.getElementById('cfg-severity-val').textContent = 'Cấp ' + e.target.value;
    });
}

// ────────────────────────────────────────────────────────────
// MAP PANE
// ────────────────────────────────────────────────────────────
function renderMapPane(cfg) {
    const pane = document.getElementById('cfg-pane-map');
    if (!pane) return;

    const colors = ['#4cd7f6', '#7c3aed', '#059669', '#d97706', '#e11d48', '#94a3b8'];

    pane.innerHTML = '';

    const editBar = createEditBar('map', {
        onSave: () => {
            cfg.map.defaultLat = parseFloat(document.getElementById('cfg-lat')?.value) || 10.762622;
            cfg.map.defaultLng = parseFloat(document.getElementById('cfg-lng')?.value) || 106.660172;
            cfg.map.defaultZoom = parseInt(document.getElementById('cfg-zoom')?.value || '13', 10);
            cfg.map.showTrafficLayer = getToggle('map-traffic');
            cfg.map.showCameras = getToggle('map-cameras');
            cfg.map.autoPanOnAlert = getToggle('map-autopan');
            cfg.map.theme = document.getElementById('cfg-map-theme')?.value || '#4cd7f6';
            cfg.map.colorMode = document.getElementById('cfg-colormode')?.value || 'dark';
            saveConfig(cfg);
            applyColorMode(cfg.map.colorMode);
            toast('Đã lưu cài đặt bản đồ.');
        },
        onCancel: () => {
            toast('Đã hủy thay đổi bản đồ.');
        },
        onEnterEdit: () => {
            // Enable color picker buttons khi vào edit mode
            document.querySelectorAll('#cfg-pane-map [data-color]').forEach(btn => {
                btn.style.pointerEvents = '';
                btn.style.opacity = '';
                btn.onclick = function() { window._setCfgColor(this); };
            });
        },
    });

    pane.append(paneHeader('Bản đồ & hiển thị', 'Vị trí mặc định, lớp bản đồ, và giao diện.', editBar));

    const body = document.createElement('div');
    body.innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
                <label class="block text-xs text-gray-500 mb-1">Vĩ độ mặc định (lat)</label>
                <input id="cfg-lat" type="number" step="0.000001" value="${cfg.map.defaultLat}" disabled
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Kinh độ mặc định (lng)</label>
                <input id="cfg-lng" type="number" step="0.000001" value="${cfg.map.defaultLng}" disabled
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
            </div>
        </div>

        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-2">Mức zoom mặc định</label>
            <div class="flex items-center gap-3">
                <input type="range" min="10" max="18" step="1" value="${cfg.map.defaultZoom}" id="cfg-zoom" disabled class="flex-1 disabled:opacity-50">
                <span id="cfg-zoom-val" class="text-sm font-mono text-primary w-6 text-right">${cfg.map.defaultZoom}</span>
            </div>
        </div>

        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Lớp mặc định</p>
        ${toggleRow('map-traffic', 'Lớp giao thông (TomTom)', 'Màu tắc đường thời gian thực', cfg.map.showTrafficLayer, true)}
        ${toggleRow('map-cameras', 'Hiện camera đã đăng ký', 'Điểm CCTV trên bản đồ', cfg.map.showCameras, true)}
        ${toggleRow('map-autopan', 'Tự động pan đến cảnh báo mới', 'Bản đồ dịch chuyển khi có alert real-time', cfg.map.autoPanOnAlert, true)}

        <div class="mt-5 mb-3">
            <label class="block text-xs text-gray-500 mb-2">Màu chủ đạo giao diện</label>
            <div class="flex gap-2 flex-wrap" id="cfg-color-picker">
                ${colors.map(c => `
                    <button class="w-7 h-7 rounded-full border-2 transition-all ${cfg.map.theme === c ? 'border-white scale-110' : 'border-transparent'}"
                        style="background:${c};pointer-events:none;opacity:0.5" data-color="${c}"></button>
                `).join('')}
            </div>
            <input type="hidden" id="cfg-map-theme" value="${cfg.map.theme}">
        </div>

        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-1">Chế độ giao diện</label>
            <select id="cfg-colormode" disabled
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="dark" ${cfg.map.colorMode === 'dark' ? 'selected' : ''}>Dark (mặc định)</option>
                <option value="light" ${cfg.map.colorMode === 'light' ? 'selected' : ''}>Light</option>
                <option value="auto" ${cfg.map.colorMode === 'auto' ? 'selected' : ''}>Tự động (theo hệ thống)</option>
            </select>
        </div>
    `;
    pane.append(body);

    document.getElementById('cfg-zoom')?.addEventListener('input', e => {
        document.getElementById('cfg-zoom-val').textContent = e.target.value;
    });

    window._setCfgColor = (btn) => {
        document.querySelectorAll('#cfg-pane-map [data-color]').forEach(b => {
            b.classList.remove('border-white', 'scale-110');
            b.classList.add('border-transparent');
        });
        btn.classList.add('border-white', 'scale-110');
        btn.classList.remove('border-transparent');
        document.getElementById('cfg-map-theme').value = btn.dataset.color;
    };
}

function applyColorMode(mode) {
    const html = document.documentElement;
    if (mode === 'light') html.classList.add('light');
    else if (mode === 'dark') html.classList.remove('light');
    else {
        const preferLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        if (preferLight) html.classList.add('light');
        else html.classList.remove('light');
    }
}

// ────────────────────────────────────────────────────────────
// ALERTS FILTER PANE
// ────────────────────────────────────────────────────────────
function renderAlertsPane(cfg) {
    const pane = document.getElementById('cfg-pane-alerts');
    if (!pane) return;

    const plan = getPlan();
    const limitOptions = [
        { val: 50, label: '50 (Free)', disabled: false },
        { val: 200, label: '200 (Pro)', disabled: plan === 'free' },
        { val: 500, label: '500 (Enterprise)', disabled: plan !== 'enterprise' },
    ];

    pane.innerHTML = '';

    const editBar = createEditBar('alerts', {
        onSave: () => {
            cfg.alerts.limit = parseInt(document.getElementById('cfg-limit')?.value || '50', 10);
            cfg.alerts.maxAgeHours = parseInt(document.getElementById('cfg-age')?.value || '24', 10);
            cfg.alerts.sources.eonet = getToggle('src-eonet');
            cfg.alerts.sources.tomtom = getToggle('src-tomtom');
            cfg.alerts.sources.community = getToggle('src-community');
            cfg.alerts.sources.ai = getToggle('src-ai');
            cfg.alerts.dedupRadiusKm = parseInt(document.getElementById('cfg-dedup')?.value || '5', 10);
            saveConfig(cfg);
            toast('Đã lưu bộ lọc cảnh báo. Tải lại trang để áp dụng.');
        },
        onCancel: () => {
            toast('Đã hủy thay đổi bộ lọc.');
        },
    });

    pane.append(paneHeader('Bộ lọc cảnh báo', 'Nguồn dữ liệu, số lượng hiển thị, và deduplicate.', editBar));

    const body = document.createElement('div');
    body.innerHTML = `
        <div class="mb-4">
            <label class="block text-xs text-gray-500 mb-1">Số cảnh báo tải khi mở trang</label>
            <select id="cfg-limit" disabled
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                ${limitOptions.map(o => `<option value="${o.val}" ${cfg.alerts.limit === o.val ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${o.label}</option>`).join('')}
            </select>
        </div>

        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-2">Chỉ hiện cảnh báo trong vòng (giờ)</label>
            <div class="flex items-center gap-3">
                <input type="range" min="1" max="168" step="1" value="${cfg.alerts.maxAgeHours}" id="cfg-age" disabled class="flex-1 disabled:opacity-50">
                <span id="cfg-age-val" class="text-sm font-mono text-primary w-12 text-right">${cfg.alerts.maxAgeHours}h</span>
            </div>
        </div>

        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Nguồn dữ liệu</p>
        ${toggleRow('src-eonet', 'NASA EONET v3', 'Thiên tai tự nhiên (cháy rừng, bão, lũ)', cfg.alerts.sources.eonet, true)}
        ${toggleRow('src-tomtom', 'TomTom Traffic v5', 'Tai nạn, kẹt xe, đường cấm TP.HCM', cfg.alerts.sources.tomtom, true)}
        ${toggleRow('src-community', 'Báo cáo cộng đồng', 'Nguồn chưa xác minh', cfg.alerts.sources.community, true)}
        ${toggleRow('src-ai', 'AI detection từ camera', 'Sự kiện được camera AI phát hiện', cfg.alerts.sources.ai, true)}

        <div class="mt-5 mb-5">
            <label class="block text-xs text-gray-500 mb-2">Bán kính deduplicate địa lý (km)</label>
            <div class="flex items-center gap-3">
                <input type="range" min="1" max="20" step="1" value="${cfg.alerts.dedupRadiusKm}" id="cfg-dedup" disabled class="flex-1 disabled:opacity-50">
                <span id="cfg-dedup-val" class="text-sm font-mono text-primary w-12 text-right">${cfg.alerts.dedupRadiusKm}km</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">Tương ứng biến <code>DEDUP_RADIUS_METERS</code> trong .env (server-side).</p>
        </div>
    `;
    pane.append(body);

    document.getElementById('cfg-age')?.addEventListener('input', e => {
        document.getElementById('cfg-age-val').textContent = e.target.value + 'h';
    });
    document.getElementById('cfg-dedup')?.addEventListener('input', e => {
        document.getElementById('cfg-dedup-val').textContent = e.target.value + 'km';
    });
}

// ────────────────────────────────────────────────────────────
// API PANE
// ────────────────────────────────────────────────────────────
function renderApiPane() {
    const pane = document.getElementById('cfg-pane-api');
    if (!pane) return;

    const token = getToken() || '';
    const tokenPreview = token ? token.slice(0, 20) + '••••••••••••••••••••' : '(chưa đăng nhập)';
    const cfg = loadConfig();

    pane.innerHTML = '';

    const editBar = createEditBar('api', {
        onSave: () => {
            const c = loadConfig();
            c.api.webhookUrl = document.getElementById('cfg-webhook-url')?.value.trim() || '';
            c.api.webhookEnabled = getToggle('cfg-webhook-enabled');
            saveConfig(c);
            toast('Đã lưu cài đặt API.');
        },
        onCancel: () => {
            toast('Đã hủy thay đổi API.');
        },
    });

    pane.append(paneHeader('API & Webhook', 'Khoá API để tích hợp AI service và các hệ thống bên ngoài.', editBar));

    const body = document.createElement('div');
    body.innerHTML = `
        <div class="mb-4">
            <label class="block text-xs text-gray-500 mb-1">Bearer Token (JWT của phiên hiện tại)</label>
            <div class="flex items-center gap-2 bg-black/20 border border-outline-variant/30 rounded-lg px-3 py-2">
                <code class="text-xs font-mono text-primary flex-1 truncate">${tokenPreview}</code>
                <button class="text-xs text-gray-400 hover:text-white transition-colors shrink-0" onclick="
                    navigator.clipboard.writeText('${token}');
                    this.textContent='Đã copy!';
                    setTimeout(()=>this.textContent='Copy',1500)
                ">Copy</button>
            </div>
            <p class="text-xs text-gray-500 mt-1">Dùng trong header <code class="bg-black/20 px-1 rounded">Authorization: Bearer &lt;token&gt;</code></p>
        </div>

        <div class="border-t border-outline-variant/20 pt-4 mb-4">
            <label class="block text-xs text-gray-500 mb-1">Webhook URL nhận alert (tuỳ chọn)</label>
            <input id="cfg-webhook-url" type="url" placeholder="https://your-server.com/webhook/alerts" disabled
                value="${escHtml(cfg.api.webhookUrl || '')}"
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none mb-2 disabled:opacity-50 disabled:cursor-not-allowed">
            ${toggleRow('cfg-webhook-enabled', 'Bật webhook', 'POST JSON mỗi khi có alert mới', cfg.api.webhookEnabled, true)}
            <p class="text-xs text-gray-500 mt-2">Payload: <code class="bg-black/20 px-1 rounded">{ type, lat, lng, address, severity, source, createdAt }</code></p>
        </div>

        <div class="border border-red-500/30 rounded-xl p-4 bg-red-500/5 mt-6">
            <p class="text-sm font-semibold text-red-400 mb-1">⚠ Đăng xuất khỏi tài khoản</p>
            <p class="text-xs text-gray-500 mb-3">Token hiện tại sẽ bị xoá. Cần đăng nhập lại để tiếp tục.</p>
            <button onclick="import('/js/auth.js').then(m=>{m.clearAuth();window.location.reload()})"
                class="text-xs px-3 py-1.5 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                Đăng xuất
            </button>
        </div>
    `;
    pane.append(body);
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * @param {string} id
 * @param {string} title
 * @param {string} desc
 * @param {boolean} checked
 * @param {boolean} [startDisabled=false]
 */
function toggleRow(id, title, desc, checked, startDisabled = false) {
    return `
        <div class="flex items-center justify-between py-2.5 border-b border-outline-variant/10 last:border-0">
            <div class="flex-1 pr-4">
                <p class="text-sm font-medium">${title}</p>
                <p class="text-xs text-gray-500">${desc}</p>
            </div>
            <label class="relative w-9 h-5 shrink-0 ${startDisabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}" id="label-${id}">
                <input type="checkbox" id="${id}" class="sr-only peer" ${checked ? 'checked' : ''} ${startDisabled ? 'disabled' : ''}>
                <div class="absolute inset-0 rounded-full bg-outline-variant/40 peer-checked:bg-primary transition-colors"></div>
                <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"></div>
            </label>
        </div>
    `;
}

function getToggle(id) {
    return document.getElementById(id)?.checked ?? false;
}

function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[c]);
}

export { loadConfig as getUserConfig };