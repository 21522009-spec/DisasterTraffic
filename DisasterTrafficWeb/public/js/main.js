/* eslint-disable no-undef */
import { isLoggedIn, getUser, getPlan, clearAuth, redirectToLogin, PLAN_LABEL, PLAN_COLOR } from '/js/auth.js';

// ====== State ======
const state = {
    markers: new Map(), // alertId -> { marker, type }
    cameraMarkers: new Map(), // cameraId -> { marker, status }
    cacheAlerts: [],
    subscribeMode: false,
    subscribePoints: [],
    subscribedBbox: loadSubscribedBbox(),
    subscribeBboxLayer: null,
    filters: { fire: true, flood: true, traffic: true, other: true },
    showCameras: true,
};

// ====== Helpers ======
function $(id) { return document.getElementById(id); }
function escapeHtml(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function showToast(msg, ms = 4000) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function loadSubscribedBbox() {
    try { return JSON.parse(localStorage.getItem('sub_bbox') || 'null'); }
    catch { return null; }
}
function saveSubscribedBbox(bbox) {
    if (!bbox) localStorage.removeItem('sub_bbox');
    else localStorage.setItem('sub_bbox', JSON.stringify(bbox));
}
function bboxFromTwoPoints(a, b) {
    return {
        minLon: Math.min(a[0], b[0]),
        maxLon: Math.max(a[0], b[0]),
        minLat: Math.min(a[1], b[1]),
        maxLat: Math.max(a[1], b[1]),
    };
}
function withinBbox(lon, lat, bbox) {
    if (!bbox) return false;
    return lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat;
}

function updateSubStatus() {
    const el = $('sub-status');
    if (!state.subscribedBbox) { el.textContent = 'Chưa theo dõi vùng nào.'; return; }
    const b = state.subscribedBbox;
    el.textContent = `Đang theo dõi: [${b.minLon.toFixed(3)}, ${b.minLat.toFixed(3)}] → [${b.maxLon.toFixed(3)}, ${b.maxLat.toFixed(3)}]`;
}

// ====== Map ======
const map = L.map('map').setView([10.762622, 106.660172], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
}).addTo(map);

// Traffic layer — gọi qua proxy backend, không cần TomTom key ở client.
const trafficLayer = L.tileLayer('/tiles/traffic/flow/relative/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.8,
});
trafficLayer.addTo(map);

// ====== Marker rendering ======
const TYPE_META = {
    fire:       { emoji: '🔥', border: 'border-red-500',    badge: 'bg-red-50 text-red-700 border-red-500' },
    flood:      { emoji: '🌊', border: 'border-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-500' },
    traffic:    { emoji: '🚗', border: 'border-yellow-500', badge: 'bg-yellow-50 text-yellow-700 border-yellow-500' },
    earthquake: { emoji: '🌍', border: 'border-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-500' },
    landslide:  { emoji: '⛰️', border: 'border-amber-700',  badge: 'bg-amber-50 text-amber-700 border-amber-700' },
    storm:      { emoji: '🌪️', border: 'border-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-500' },
    other:      { emoji: '⚠️', border: 'border-gray-500',   badge: 'bg-gray-50 text-gray-700 border-gray-500' },
};

function metaFor(type) { return TYPE_META[type] || TYPE_META.other; }
function bucketOf(type) {
    if (type === 'fire' || type === 'flood' || type === 'traffic') return type;
    return 'other';
}

function buildIcon(type) {
    const meta = metaFor(type);
    return L.divIcon({
        html: `<div class="w-10 h-10 flex items-center justify-center rounded-full shadow-lg text-2xl bg-white border-2 ${meta.border}">${meta.emoji}</div>`,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
    });
}

function buildPopupHtml(alert) {
    const meta = metaFor(alert.type);
    const time = alert.createdAt
        ? new Date(alert.createdAt).toLocaleString('vi-VN')
        : '';
    const desc = alert.description
        ? `<div class="mt-1 text-gray-600">${escapeHtml(alert.description)}</div>`
        : '';
    const src = alert.source
        ? `<span class="ml-1 text-xs px-2 py-0.5 rounded-full border ${meta.badge}">${escapeHtml(alert.source)}</span>`
        : '';
    const sev = alert.severity ? `<span class="ml-1 text-xs text-gray-500">sev ${alert.severity}/5</span>` : '';
    const link = alert.sourceUrl
        ? `<div class="mt-1"><a href="${escapeHtml(alert.sourceUrl)}" target="_blank" rel="noreferrer" class="text-blue-600 underline text-sm">Xem nguồn</a></div>`
        : '';

    return `
        <div style="min-width:220px">
            <div class="font-bold">${meta.emoji} ${escapeHtml(alert.type)} ${src} ${sev}</div>
            <div class="mt-1 text-sm">${escapeHtml(alert.address || '')}</div>
            <div class="mt-1 text-xs text-gray-500">${escapeHtml(time)}</div>
            ${desc}
            ${link}
        </div>
    `;
}

function addAlertMarker(alert) {
    if (!alert || alert.lng == null || alert.lat == null) return;
    if (alert._id && state.markers.has(alert._id)) return; // tránh trùng

    const marker = L.marker([alert.lat, alert.lng], { icon: buildIcon(alert.type) });
    marker.bindPopup(buildPopupHtml(alert));
    marker.addTo(map);

    if (alert._id) state.markers.set(alert._id, { marker, type: alert.type });

    applyVisibility();
}

function addAlertToSidebar(alert) {
    const list = $('alert-list');
    const meta = metaFor(alert.type);
    const li = document.createElement('li');
    li.className = `p-3 border-l-4 rounded shadow-sm transition-all ${meta.badge}`;
    li.innerHTML = `
        <div class="font-semibold">${meta.emoji} ${escapeHtml(alert.type)}</div>
        <div class="text-xs">${escapeHtml(alert.address || '')}</div>
    `;
    list.prepend(li);
    // Giới hạn 50 item trong sidebar để không lag DOM
    while (list.children.length > 50) list.removeChild(list.lastChild);
}

function applyVisibility() {
    for (const { marker, type } of state.markers.values()) {
        const bucket = bucketOf(type);
        const visible = state.filters[bucket];
        const hasMarker = map.hasLayer(marker);
        if (visible && !hasMarker) marker.addTo(map);
        else if (!visible && hasMarker) map.removeLayer(marker);
    }
}

// ====== Subscribe bbox ======
function drawSubscribeBbox() {
    if (state.subscribeBboxLayer) {
        map.removeLayer(state.subscribeBboxLayer);
        state.subscribeBboxLayer = null;
    }
    const b = state.subscribedBbox;
    if (!b) return;

    const bounds = [[b.minLat, b.minLon], [b.maxLat, b.maxLon]];
    state.subscribeBboxLayer = L.rectangle(bounds, {
        color: '#111827', weight: 2, fillOpacity: 0.05,
    }).addTo(map);
}

async function notifyBrowser(msg) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* noop */ }
    }
    if (Notification.permission === 'granted') {
        new Notification('DisasterTraffic', { body: msg });
    }
}

// ====== Modal report ======
function openReportModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
        <div class="modal">
            <h3>Báo cáo cộng đồng</h3>
            <div class="grid">
                <div>
                    <label class="text-xs text-gray-600">Loại</label>
                    <select id="r-type">
                        <option value="traffic">Kẹt xe / sự cố giao thông</option>
                        <option value="flood">Ngập lụt</option>
                        <option value="fire">Hỏa hoạn</option>
                        <option value="landslide">Sạt lở</option>
                        <option value="storm">Bão</option>
                        <option value="other">Khác</option>
                    </select>
                </div>
                <div>
                    <label class="text-xs text-gray-600">Mức độ (1-5)</label>
                    <input id="r-sev" type="number" min="1" max="5" value="3" />
                </div>
                <div>
                    <label class="text-xs text-gray-600">Vĩ độ</label>
                    <input id="r-lat" type="number" step="0.000001" placeholder="click bản đồ để điền" />
                </div>
                <div>
                    <label class="text-xs text-gray-600">Kinh độ</label>
                    <input id="r-lon" type="number" step="0.000001" placeholder="click bản đồ để điền" />
                </div>
            </div>
            <div class="mt-2">
                <label class="text-xs text-gray-600">Địa chỉ (tùy chọn)</label>
                <input id="r-addr" type="text" placeholder="VD: Đường Lê Văn Sỹ, Q.3" />
            </div>
            <div class="mt-2">
                <label class="text-xs text-gray-600">Mô tả</label>
                <textarea id="r-desc" placeholder="Mô tả ngắn"></textarea>
            </div>
            <div class="actions">
                <button id="r-cancel" class="px-3 py-2 bg-gray-100 rounded-lg">Huỷ</button>
                <button id="r-submit" class="px-3 py-2 bg-blue-600 text-white rounded-lg">Gửi</button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    const modal = backdrop.querySelector('.modal');
    const elLat = modal.querySelector('#r-lat');
    const elLon = modal.querySelector('#r-lon');

    function fillFromMap(e) {
        elLat.value = e.latlng.lat.toFixed(6);
        elLon.value = e.latlng.lng.toFixed(6);
        showToast('Đã điền toạ độ từ bản đồ.');
    }
    map.on('click', fillFromMap);

    function close() {
        backdrop.remove();
        map.off('click', fillFromMap);
    }

    modal.querySelector('#r-cancel').addEventListener('click', close);
    modal.querySelector('#r-submit').addEventListener('click', async () => {
        const payload = {
            type: modal.querySelector('#r-type').value,
            severity: Number(modal.querySelector('#r-sev').value) || 3,
            lat: Number(elLat.value),
            lng: Number(elLon.value),
            address: modal.querySelector('#r-addr').value.trim(),
            description: modal.querySelector('#r-desc').value.trim(),
        };
        if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
            showToast('Toạ độ chưa hợp lệ. Click bản đồ để điền.');
            return;
        }
        try {
            const r = await fetch('/api/alerts/community', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${r.status}`);
            }
            close();
            showToast('Đã gửi báo cáo, cảm ơn bạn ✅');
        } catch (e) {
            showToast('Gửi báo cáo lỗi: ' + e.message);
        }
    });
}

// ====== Cameras ======
const CAMERA_STATUS_COLOR = {
    active: '#7c3aed',  // purple
    paused: '#9ca3af',  // gray
    broken: '#ef4444',  // red
    pending: '#f59e0b', // amber
};

function buildCameraIcon(status) {
    const color = CAMERA_STATUS_COLOR[status] || CAMERA_STATUS_COLOR.active;
    return L.divIcon({
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:14px">📷</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });
}

function buildCameraPopup(cam) {
    const meta = TYPE_META; // not used here
    const last = cam.lastAlertAt
        ? new Date(cam.lastAlertAt).toLocaleString('vi-VN')
        : 'chưa có';
    const events = (cam.allowedEventTypes || []).join(', ') || 'tất cả';
    return `
        <div style="min-width:240px">
            <div class="font-bold">📷 ${escapeHtml(cam.name)}</div>
            <div class="mt-1 text-xs text-gray-500">${escapeHtml(cam.kind || 'cctv')} · ${escapeHtml(cam.status || 'active')}</div>
            <div class="mt-1 text-sm">${escapeHtml(cam.address || '')}</div>
            <div class="mt-1 text-xs">Sự kiện: <span class="text-gray-700">${escapeHtml(events)}</span></div>
            <div class="mt-1 text-xs text-gray-500">Lần báo gần nhất: ${escapeHtml(last)}</div>
        </div>
    `;
}

function addOrUpdateCameraMarker(cam) {
    if (!cam || cam.lng == null || cam.lat == null) return;
    const id = cam._id;
    const existing = state.cameraMarkers.get(id);

    if (existing) {
        existing.marker.setLatLng([cam.lat, cam.lng]);
        existing.marker.setIcon(buildCameraIcon(cam.status));
        existing.marker.setPopupContent(buildCameraPopup(cam));
        existing.status = cam.status;
        return;
    }

    const marker = L.marker([cam.lat, cam.lng], { icon: buildCameraIcon(cam.status) });
    marker.bindPopup(buildCameraPopup(cam));
    if (state.showCameras) marker.addTo(map);
    state.cameraMarkers.set(id, { marker, status: cam.status });
}

function removeCameraMarker(id) {
    const item = state.cameraMarkers.get(id);
    if (!item) return;
    map.removeLayer(item.marker);
    state.cameraMarkers.delete(id);
}

function applyCameraVisibility() {
    for (const { marker } of state.cameraMarkers.values()) {
        const has = map.hasLayer(marker);
        if (state.showCameras && !has) marker.addTo(map);
        else if (!state.showCameras && has) map.removeLayer(marker);
    }
}

async function loadCameras() {
    try {
        const r = await fetch('/api/cameras?limit=500');
        const cams = await r.json();
        if (!Array.isArray(cams)) return;
        cams.forEach(addOrUpdateCameraMarker);
    } catch (e) {
        console.error('Lỗi tải camera:', e);
    }
}

// ====== Initial load ======
async function loadHistoryAlerts() {
    try {
        const limit = alertLimitByPlan();
        const response = await fetch(`/api/alerts?limit=${limit}`);
        const alerts = await response.json();
        if (!Array.isArray(alerts)) return;
        // Vẽ theo thứ tự cũ trước → mới sau, để cái mới nằm trên cùng sidebar
        alerts.reverse().forEach((alert) => {
            state.cacheAlerts.push(alert);
            addAlertMarker(alert);
            addAlertToSidebar(alert);
        });
    } catch (error) {
        console.error('Lỗi tải lịch sử cảnh báo:', error);
        showToast('Không tải được lịch sử cảnh báo.');
    }
}

// ====== Wire UI ======
$('toggle-traffic').addEventListener('change', (e) => {
    if (e.target.checked) trafficLayer.addTo(map);
    else map.removeLayer(trafficLayer);
});

const camToggle = $('toggle-cameras');
if (camToggle) {
    camToggle.addEventListener('change', (e) => {
        state.showCameras = e.target.checked;
        applyCameraVisibility();
    });
}

['fire', 'flood', 'traffic', 'other'].forEach((bucket) => {
    const id = `toggle-${bucket}`;
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
        state.filters[bucket] = e.target.checked;
        applyVisibility();
    });
});

$('btn-add-report').addEventListener('click', () => openReportModal());

$('btn-subscribe').addEventListener('click', () => {
    state.subscribeMode = true;
    state.subscribePoints = [];
    showToast('Click 2 điểm trên bản đồ để chọn vùng theo dõi.');
});
$('btn-clear-subscribe').addEventListener('click', () => {
    state.subscribedBbox = null;
    saveSubscribedBbox(null);
    drawSubscribeBbox();
    updateSubStatus();
    showToast('Đã xoá vùng theo dõi.');
});

map.on('click', (e) => {
    if (!state.subscribeMode) return;
    state.subscribePoints.push([e.latlng.lng, e.latlng.lat]);
    showToast(`Đã chọn ${state.subscribePoints.length}/2 điểm`);
    if (state.subscribePoints.length === 2) {
        state.subscribedBbox = bboxFromTwoPoints(
            state.subscribePoints[0],
            state.subscribePoints[1]
        );
        saveSubscribedBbox(state.subscribedBbox);
        state.subscribeMode = false;
        state.subscribePoints = [];
        drawSubscribeBbox();
        updateSubStatus();
        showToast('Đã lưu vùng theo dõi ✅');
    }
});

// ====== Realtime ======
const socket = io();

socket.on('connect', () => console.log('socket connected'));
socket.on('hello', (data) => console.log('hello', data));

socket.on('camera:created', (cam) => {
    addOrUpdateCameraMarker(cam);
    showToast(`+ Camera mới: ${cam.name}`);
});
socket.on('camera:updated', (cam) => {
    addOrUpdateCameraMarker(cam);
});
socket.on('camera:deleted', ({ _id }) => {
    removeCameraMarker(_id);
});

socket.on('new-alert', (alert) => {
    if (!alert) return;
    state.cacheAlerts.unshift(alert);
    addAlertMarker(alert);
    addAlertToSidebar(alert);

    // Trượt map tới vị trí mới
    if (alert.lat != null && alert.lng != null) {
        map.panTo([alert.lat, alert.lng]);
    }

    // Notify nếu trong vùng đăng ký
    if (
        state.subscribedBbox &&
        withinBbox(alert.lng, alert.lat, state.subscribedBbox)
    ) {
        notifyBrowser(`⚠️ ${alert.type}: ${alert.address || ''}`);
    }
});

// ====== Auth UI ======
function renderAuthBar() {
    const bar = document.getElementById('auth-bar');
    const adminLink = document.getElementById('admin-link');
    const upgradeLink = document.getElementById('upgrade-link');
    if (!bar) return;

    if (!isLoggedIn()) {
        bar.innerHTML = `
            <a href="/login.html" class="block w-full text-center py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors">
                Đăng nhập / Đăng ký
            </a>`;
        if (upgradeLink) upgradeLink.classList.remove('hidden');
        return;
    }

    const user = getUser();
    const plan = getPlan();
    bar.innerHTML = `
        <div class="flex items-center justify-between">
            <div>
                <div class="text-sm font-medium text-gray-800 truncate max-w-[140px]">${escapeHtml(user.name)}</div>
                <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLOR[plan]}">${PLAN_LABEL[plan]}</span>
            </div>
            <div class="flex gap-1 flex-col items-end">
                <a href="/login.html?upgrade=1" class="text-xs text-blue-600 hover:underline">⭐ Nâng cấp</a>
                <button id="btn-logout" class="text-xs text-gray-400 hover:text-red-500">Đăng xuất</button>
            </div>
        </div>`;

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        clearAuth();
        window.location.reload();
    });

    // Hiện link admin nếu Enterprise
    if (plan === 'enterprise') {
        if (adminLink) adminLink.classList.remove('hidden');
    } else {
        if (upgradeLink) upgradeLink.classList.remove('hidden');
    }
}

// Giới hạn số lượng alert theo plan
function alertLimitByPlan() {
    const plan = getPlan();
    if (plan === 'enterprise') return 500;
    if (plan === 'pro') return 200;
    return 50;
}

// ====== Boot ======
renderAuthBar();
updateSubStatus();
drawSubscribeBbox();
loadHistoryAlerts();
loadCameras();
