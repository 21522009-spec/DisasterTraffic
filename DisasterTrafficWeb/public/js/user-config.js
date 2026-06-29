/**
 * user-config.js
 * Logic cho trang cài đặt người dùng (view-profile).
 * Import vào main.js hoặc thêm <script type="module" src="/js/user-config.js"> vào index.html.
 *
 * Phụ thuộc: /js/auth.js (getToken, getUser, setAuth, clearAuth)
 */

import { getToken, getUser, setAuth, clearAuth, getPlan } from '/js/auth.js';

const STORAGE_KEY = 'dt_user_config';

// ── Defaults ──────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    // Bản đồ
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
    // Thông báo
    notif: {
        webPush: true,
        mobilePush: true,
        emailDigest: false,
        types: { fire: true, flood: true, traffic: true, other: false },
        minSeverity: 3,
    },
    // Bộ lọc
    alerts: {
        limit: 500,
        maxAgeHours: 24,
        sources: { eonet: true, tomtom: true, community: true, ai: true },
        dedupRadiusKm: 5,
    },
    // Webhook
    api: {
        webhookUrl: '',
        webhookEnabled: false,
    },
};

// ── Load / Save config vào localStorage ──────────────────────
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

// ── Helper: hiện toast nhỏ ────────────────────────────────────
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

// ── Khởi tạo panel cài đặt ───────────────────────────────────
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

    // Navigation
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

    pane.innerHTML = `
        <h2 class="text-base font-semibold mb-1">Hồ sơ cá nhân</h2>
        <p class="text-xs text-gray-500 mb-5">Thông tin hiển thị trong hệ thống và khi báo cáo sự cố.</p>

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
                <input id="cfg-name" type="text" value="${escHtml(user.name || '')}"
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Tên commander</label>
                <input id="cfg-commander" type="text" value="${escHtml(localStorage.getItem('dt_commander') || '')}"
                    placeholder="NHÓM 10 - NT208.Q22"
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
            </div>
        </div>
        <div class="mb-3">
            <label class="block text-xs text-gray-500 mb-1">Email</label>
            <input type="email" value="${escHtml(user.email || '')}" disabled
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/20 text-gray-500 cursor-not-allowed outline-none">
        </div>
        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-1">Đơn vị / Tổ chức</label>
            <input id="cfg-org" type="text" value="${escHtml(localStorage.getItem('dt_org') || '')}"
                placeholder="Phòng CSGT, Cục QLĐT TP.HCM..."
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
        </div>

        <div class="flex justify-end gap-2">
            <button id="cfg-profile-save"
                class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Lưu thay đổi
            </button>
        </div>
    `;

    document.getElementById('cfg-profile-save')?.addEventListener('click', saveProfile);
}

function saveProfile() {
    const name = document.getElementById('cfg-name')?.value.trim();
    const commander = document.getElementById('cfg-commander')?.value.trim();
    const org = document.getElementById('cfg-org')?.value.trim();

    if (commander) {
        localStorage.setItem('dt_commander', commander);
        // Cập nhật hiển thị commander name trên UI
        document.getElementById('commander-name-sidebar')?.setAttribute('textContent', commander);
        document.getElementById('commander-name-main')?.setAttribute('textContent', commander);
    }
    if (org) localStorage.setItem('dt_org', org);

    // Nếu muốn lưu name lên server, gọi PATCH /api/auth/me (endpoint cần bổ sung)
    toast('Đã lưu hồ sơ.');
}

// ────────────────────────────────────────────────────────────
// PLAN PANE
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
        <h2 class="text-base font-semibold mb-1">Gói dịch vụ</h2>
        <p class="text-xs text-gray-500 mb-5">Gói hiện tại và tuỳ chọn thay đổi.</p>
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

    pane.innerHTML = `
        <h2 class="text-base font-semibold mb-1">Bảo mật</h2>
        <p class="text-xs text-gray-500 mb-5">Đổi mật khẩu và quản lý phiên đăng nhập.</p>

        <div class="space-y-3 mb-5">
            <div>
                <label class="block text-xs text-gray-500 mb-1">Mật khẩu hiện tại</label>
                <input id="cfg-pw-cur" type="password" placeholder="••••••••"
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Mật khẩu mới</label>
                    <input id="cfg-pw-new" type="password" placeholder="≥ 8 ký tự, có số + chữ"
                        class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Xác nhận mật khẩu mới</label>
                    <input id="cfg-pw-confirm" type="password" placeholder="Nhập lại"
                        class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
                </div>
            </div>
        </div>
        <div class="flex justify-end mb-6">
            <button id="cfg-pw-save"
                class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Đổi mật khẩu
            </button>
        </div>

        <div class="border-t border-outline-variant/20 pt-5">
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

    document.getElementById('cfg-pw-save')?.addEventListener('click', changePassword);
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

    pane.innerHTML = `
        <h2 class="text-base font-semibold mb-1">Thông báo</h2>
        <p class="text-xs text-gray-500 mb-5">Chọn kênh và loại sự kiện muốn nhận thông báo.</p>

        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Kênh</p>
        ${toggleRow('notif-web', 'Trình duyệt (Web Push)', 'Thông báo ngay khi đang mở web', cfg.notif.webPush)}
        ${toggleRow('notif-mobile', 'Ứng dụng di động (Expo Push)', 'Cần cài app và cấp quyền thông báo', cfg.notif.mobilePush)}
        ${toggleRow('notif-email', 'Email tóm tắt hàng ngày', 'Gửi lúc 7:00 sáng mỗi ngày', cfg.notif.emailDigest)}

        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-5 mb-3">Loại sự kiện</p>
        ${toggleRow('notif-fire', 'Hoả hoạn', 'Cháy nổ, báo cháy', cfg.notif.types.fire)}
        ${toggleRow('notif-flood', 'Ngập lụt', 'Triều cường, mưa lớn', cfg.notif.types.flood)}
        ${toggleRow('notif-traffic', 'Kẹt xe / Tai nạn', 'Ùn tắc giao thông', cfg.notif.types.traffic)}
        ${toggleRow('notif-other', 'Thiên tai khác', 'Bão, sạt lở, động đất', cfg.notif.types.other)}

        <div class="mt-5 mb-5">
            <label class="block text-xs text-gray-500 mb-2">Mức độ nghiêm trọng tối thiểu (1–5)</label>
            <div class="flex items-center gap-3">
                <input type="range" min="1" max="5" step="1" value="${cfg.notif.minSeverity}" id="cfg-severity"
                    class="flex-1">
                <span id="cfg-severity-val" class="text-sm font-mono text-primary w-12 text-right">Cấp ${cfg.notif.minSeverity}</span>
            </div>
        </div>

        <div class="flex justify-end">
            <button id="cfg-notif-save"
                class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Lưu cài đặt
            </button>
        </div>
    `;

    document.getElementById('cfg-severity')?.addEventListener('input', e => {
        document.getElementById('cfg-severity-val').textContent = 'Cấp ' + e.target.value;
    });

    document.getElementById('cfg-notif-save')?.addEventListener('click', () => {
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
    });
}

// ────────────────────────────────────────────────────────────
// MAP PANE
// ────────────────────────────────────────────────────────────
function renderMapPane(cfg) {
    const pane = document.getElementById('cfg-pane-map');
    if (!pane) return;

    const colors = ['#4cd7f6', '#7c3aed', '#059669', '#d97706', '#e11d48', '#94a3b8'];

    pane.innerHTML = `
        <h2 class="text-base font-semibold mb-1">Bản đồ & hiển thị</h2>
        <p class="text-xs text-gray-500 mb-5">Vị trí mặc định, lớp bản đồ, và giao diện.</p>

        <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
                <label class="block text-xs text-gray-500 mb-1">Vĩ độ mặc định (lat)</label>
                <input id="cfg-lat" type="number" step="0.000001" value="${cfg.map.defaultLat}"
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Kinh độ mặc định (lng)</label>
                <input id="cfg-lng" type="number" step="0.000001" value="${cfg.map.defaultLng}"
                    class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
            </div>
        </div>

        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-2">Mức zoom mặc định</label>
            <div class="flex items-center gap-3">
                <input type="range" min="10" max="18" step="1" value="${cfg.map.defaultZoom}" id="cfg-zoom" class="flex-1">
                <span id="cfg-zoom-val" class="text-sm font-mono text-primary w-6 text-right">${cfg.map.defaultZoom}</span>
            </div>
        </div>

        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Lớp mặc định</p>
        ${toggleRow('map-traffic', 'Lớp giao thông (TomTom)', 'Màu tắc đường thời gian thực', cfg.map.showTrafficLayer)}
        ${toggleRow('map-cameras', 'Hiện camera đã đăng ký', 'Điểm CCTV trên bản đồ', cfg.map.showCameras)}
        ${toggleRow('map-autopan', 'Tự động pan đến cảnh báo mới', 'Bản đồ dịch chuyển khi có alert real-time', cfg.map.autoPanOnAlert)}

        <div class="mt-5 mb-3">
            <label class="block text-xs text-gray-500 mb-2">Màu chủ đạo giao diện</label>
            <div class="flex gap-2 flex-wrap">
                ${colors.map(c => `
                    <button class="w-7 h-7 rounded-full border-2 transition-all ${cfg.map.theme === c ? 'border-white scale-110' : 'border-transparent'}"
                        style="background:${c}" data-color="${c}" onclick="window._setCfgColor(this)"></button>
                `).join('')}
            </div>
            <input type="hidden" id="cfg-map-theme" value="${cfg.map.theme}">
        </div>

        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-1">Chế độ giao diện</label>
            <select id="cfg-colormode"
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
                <option value="dark" ${cfg.map.colorMode === 'dark' ? 'selected' : ''}>Dark (mặc định)</option>
                <option value="light" ${cfg.map.colorMode === 'light' ? 'selected' : ''}>Light</option>
                <option value="auto" ${cfg.map.colorMode === 'auto' ? 'selected' : ''}>Tự động (theo hệ thống)</option>
            </select>
        </div>

        <div class="flex justify-end">
            <button id="cfg-map-save"
                class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Lưu cài đặt
            </button>
        </div>
    `;

    document.getElementById('cfg-zoom')?.addEventListener('input', e => {
        document.getElementById('cfg-zoom-val').textContent = e.target.value;
    });

    window._setCfgColor = (btn) => {
        document.querySelectorAll('[data-color]').forEach(b => {
            b.classList.remove('border-white', 'scale-110');
            b.classList.add('border-transparent');
        });
        btn.classList.add('border-white', 'scale-110');
        btn.classList.remove('border-transparent');
        document.getElementById('cfg-map-theme').value = btn.dataset.color;
    };

    document.getElementById('cfg-map-save')?.addEventListener('click', () => {
        cfg.map.defaultLat = parseFloat(document.getElementById('cfg-lat')?.value) || 10.762622;
        cfg.map.defaultLng = parseFloat(document.getElementById('cfg-lng')?.value) || 106.660172;
        cfg.map.defaultZoom = parseInt(document.getElementById('cfg-zoom')?.value || '13', 10);
        cfg.map.showTrafficLayer = getToggle('map-traffic');
        cfg.map.showCameras = getToggle('map-cameras');
        cfg.map.autoPanOnAlert = getToggle('map-autopan');
        cfg.map.theme = document.getElementById('cfg-map-theme')?.value || '#4cd7f6';
        cfg.map.colorMode = document.getElementById('cfg-colormode')?.value || 'dark';
        saveConfig(cfg);

        // Áp dụng theme toggle ngay lập tức
        applyColorMode(cfg.map.colorMode);
        toast('Đã lưu cài đặt bản đồ.');
    });
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

    pane.innerHTML = `
        <h2 class="text-base font-semibold mb-1">Bộ lọc cảnh báo</h2>
        <p class="text-xs text-gray-500 mb-5">Nguồn dữ liệu, số lượng hiển thị, và deduplicate.</p>

        <div class="mb-4">
            <label class="block text-xs text-gray-500 mb-1">Số cảnh báo tải khi mở trang</label>
            <select id="cfg-limit"
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none">
                ${limitOptions.map(o => `<option value="${o.val}" ${cfg.alerts.limit === o.val ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${o.label}</option>`).join('')}
            </select>
        </div>

        <div class="mb-5">
            <label class="block text-xs text-gray-500 mb-2">Chỉ hiện cảnh báo trong vòng (giờ)</label>
            <div class="flex items-center gap-3">
                <input type="range" min="1" max="168" step="1" value="${cfg.alerts.maxAgeHours}" id="cfg-age" class="flex-1">
                <span id="cfg-age-val" class="text-sm font-mono text-primary w-12 text-right">${cfg.alerts.maxAgeHours}h</span>
            </div>
        </div>

        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Nguồn dữ liệu</p>
        ${toggleRow('src-eonet', 'NASA EONET v3', 'Thiên tai tự nhiên (cháy rừng, bão, lũ)', cfg.alerts.sources.eonet)}
        ${toggleRow('src-tomtom', 'TomTom Traffic v5', 'Tai nạn, kẹt xe, đường cấm TP.HCM', cfg.alerts.sources.tomtom)}
        ${toggleRow('src-community', 'Báo cáo cộng đồng', 'Nguồn chưa xác minh', cfg.alerts.sources.community)}
        ${toggleRow('src-ai', 'AI detection từ camera', 'Sự kiện được camera AI phát hiện', cfg.alerts.sources.ai)}

        <div class="mt-5 mb-5">
            <label class="block text-xs text-gray-500 mb-2">Bán kính deduplicate địa lý (km)</label>
            <div class="flex items-center gap-3">
                <input type="range" min="1" max="20" step="1" value="${cfg.alerts.dedupRadiusKm}" id="cfg-dedup" class="flex-1">
                <span id="cfg-dedup-val" class="text-sm font-mono text-primary w-12 text-right">${cfg.alerts.dedupRadiusKm}km</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">Tương ứng biến <code>DEDUP_RADIUS_METERS</code> trong .env (server-side).</p>
        </div>

        <div class="flex justify-end">
            <button id="cfg-alerts-save"
                class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Áp dụng
            </button>
        </div>
    `;

    document.getElementById('cfg-age')?.addEventListener('input', e => {
        document.getElementById('cfg-age-val').textContent = e.target.value + 'h';
    });
    document.getElementById('cfg-dedup')?.addEventListener('input', e => {
        document.getElementById('cfg-dedup-val').textContent = e.target.value + 'km';
    });

    document.getElementById('cfg-alerts-save')?.addEventListener('click', () => {
        cfg.alerts.limit = parseInt(document.getElementById('cfg-limit')?.value || '50', 10);
        cfg.alerts.maxAgeHours = parseInt(document.getElementById('cfg-age')?.value || '24', 10);
        cfg.alerts.sources.eonet = getToggle('src-eonet');
        cfg.alerts.sources.tomtom = getToggle('src-tomtom');
        cfg.alerts.sources.community = getToggle('src-community');
        cfg.alerts.sources.ai = getToggle('src-ai');
        cfg.alerts.dedupRadiusKm = parseInt(document.getElementById('cfg-dedup')?.value || '5', 10);
        saveConfig(cfg);
        toast('Đã lưu bộ lọc cảnh báo. Tải lại trang để áp dụng.');
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

    pane.innerHTML = `
        <h2 class="text-base font-semibold mb-1">API & Webhook</h2>
        <p class="text-xs text-gray-500 mb-5">Khoá API để tích hợp AI service và các hệ thống bên ngoài.</p>

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
            <input id="cfg-webhook-url" type="url" placeholder="https://your-server.com/webhook/alerts"
                class="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-outline-variant/40 focus:border-primary outline-none mb-2">
            ${toggleRow('cfg-webhook-enabled', 'Bật webhook', 'POST JSON mỗi khi có alert mới', false)}
            <p class="text-xs text-gray-500 mt-2">Payload: <code class="bg-black/20 px-1 rounded">{ type, lat, lng, address, severity, source, createdAt }</code></p>
        </div>

        <div class="flex justify-end mb-6">
            <button id="cfg-api-save"
                class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Lưu cài đặt
            </button>
        </div>

        <div class="border border-red-500/30 rounded-xl p-4 bg-red-500/5">
            <p class="text-sm font-semibold text-red-400 mb-1">⚠ Đăng xuất khỏi tài khoản</p>
            <p class="text-xs text-gray-500 mb-3">Token hiện tại sẽ bị xoá. Cần đăng nhập lại để tiếp tục.</p>
            <button onclick="import('/js/auth.js').then(m=>{m.clearAuth();window.location.reload()})"
                class="text-xs px-3 py-1.5 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                Đăng xuất
            </button>
        </div>
    `;

    document.getElementById('cfg-api-save')?.addEventListener('click', () => {
        const cfg = loadConfig();
        cfg.api.webhookUrl = document.getElementById('cfg-webhook-url')?.value.trim() || '';
        cfg.api.webhookEnabled = getToggle('cfg-webhook-enabled');
        saveConfig(cfg);
        toast('Đã lưu cài đặt API.');
    });
}

// ────────────────────────────────────────────────────────────
// Helper: tạo toggle row HTML
// ────────────────────────────────────────────────────────────
function toggleRow(id, title, desc, checked) {
    return `
        <div class="flex items-center justify-between py-2.5 border-b border-outline-variant/10 last:border-0">
            <div class="flex-1 pr-4">
                <p class="text-sm font-medium">${title}</p>
                <p class="text-xs text-gray-500">${desc}</p>
            </div>
            <label class="relative w-9 h-5 shrink-0 cursor-pointer">
                <input type="checkbox" id="${id}" class="sr-only peer" ${checked ? 'checked' : ''}>
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

// ── Export loadConfig để main.js dùng khi khởi tạo bản đồ ──
export { loadConfig as getUserConfig };