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
    totalAlerts: 0,
    currentView: 'map',
    commanderName: 'NHÓM 10 - NT208.Q22',
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
    if (!el) return;
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
    if (!el) return;
    if (!state.subscribedBbox) { el.textContent = 'Protocol inactive.'; return; }
    const b = state.subscribedBbox;
    el.textContent = `Active: [${b.minLon.toFixed(2)}, ${b.minLat.toFixed(2)}] -> [${b.maxLon.toFixed(2)}, ${b.maxLat.toFixed(2)}]`;
}

// ====== Map ======
const map = L.map('map').setView([10.762622, 106.660172], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
}).addTo(map);

const trafficLayer = L.tileLayer('/tiles/traffic/flow/relative/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.5,
});
trafficLayer.addTo(map);

// ====== Marker rendering ======
const TYPE_META = {
    fire:       { emoji: '🔥', icon: 'local_fire_department', color: 'error',   accent: 'text-error' },
    flood:      { emoji: '🌊', icon: 'flood',                color: 'primary', accent: 'text-primary' },
    traffic:    { emoji: '🚗', icon: 'traffic',              color: 'tertiary', accent: 'text-tertiary' },
    earthquake: { emoji: '🌍', icon: 'volcano',              color: 'tertiary', accent: 'text-tertiary' },
    landslide:  { emoji: '⛰️', icon: 'landscape',            color: 'tertiary', accent: 'text-tertiary' },
    storm:      { emoji: '🌪️', icon: 'cyclone',              color: 'primary', accent: 'text-primary' },
    other:      { emoji: '⚠️', icon: 'warning',              color: 'outline', accent: 'text-on-surface-variant' },
};

function metaFor(type) { return TYPE_META[type] || TYPE_META.other; }
function bucketOf(type) {
    if (type === 'fire' || type === 'flood' || type === 'traffic') return type;
    return 'other';
}

function buildIcon(type) {
    const meta = metaFor(type);
    return L.divIcon({
        html: `
            <div class="relative w-10 h-10 flex items-center justify-center">
                <div class="absolute inset-0 bg-${meta.color} opacity-20 rounded-full pulse-red"></div>
                <div class="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-${meta.color}/50 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                    <span class="material-symbols-outlined text-${meta.color} text-[20px]">${meta.icon}</span>
                </div>
            </div>`,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    });
}

function buildPopupHtml(alert) {
    const meta = metaFor(alert.type);
    const time = alert.createdAt ? new Date(alert.createdAt).toLocaleString('vi-VN') : '--:--';
    const sev = alert.severity ? `<span class="px-2 py-0.5 rounded bg-${alert.severity >= 4 ? 'error' : 'primary'}/10 text-${alert.severity >= 4 ? 'error' : 'primary'} text-[10px] font-bold">LVL ${alert.severity}</span>` : '';
    const desc = alert.description ? `<div class="mt-2 text-sm text-on-surface border-t border-outline-variant/10 pt-2">${escapeHtml(alert.description)}</div>` : '';
    
    return `
        <div class="p-1 font-body-md" style="min-width:220px">
            <div class="flex items-center gap-2 font-bold mb-2">
                <span class="material-symbols-outlined text-${meta.color} text-[18px]">${meta.icon}</span>
                <span class="uppercase tracking-tight text-primary">${escapeHtml(alert.type)}</span>
                ${sev}
            </div>
            <div class="text-[13px] text-on-surface-variant font-medium">${escapeHtml(alert.address || 'Vị trí không xác định')}</div>
            <div class="mt-2 flex items-center justify-between text-[11px] text-gray-500 font-data-mono">
                <span>${escapeHtml(time)}</span>
                <span class="uppercase">${escapeHtml(alert.source || 'Community')}</span>
            </div>
            ${desc}
        </div>
    `;
}

function addAlertMarker(alert) {
    if (!alert || alert.lng == null || alert.lat == null) return;
    if (alert._id && state.markers.has(alert._id)) return;

    const marker = L.marker([alert.lat, alert.lng], { icon: buildIcon(alert.type) });
    marker.bindPopup(buildPopupHtml(alert));
    marker.addTo(map);

    if (alert._id) state.markers.set(alert._id, { marker, type: alert.type });
    applyVisibility();
}

function addAlertToSidebar(alert) {
    const list = $('alert-list');
    if (!list) return;
    const meta = metaFor(alert.type);
    const time = alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const severity = alert.severity ? (alert.severity >= 4 ? 'CRITICAL' : 'MODERATE') : 'INFO';
    const accentClass = alert.severity >= 4 ? 'text-error' : meta.accent;

    const li = document.createElement('div');
    li.className = `group p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 hover:border-${meta.color}/40 transition-all cursor-pointer`;
    li.onclick = () => {
        switchView('map');
        map.flyTo([alert.lat, alert.lng], 15);
        state.markers.get(alert._id)?.marker.openPopup();
    };

    li.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
                <div class="p-2 rounded bg-${meta.color}/10 text-${meta.color}">
                    <span class="material-symbols-outlined text-[20px]">${meta.icon}</span>
                </div>
                <div>
                    <div class="font-label-caps text-[10px] ${accentClass}">${severity}</div>
                    <div class="font-body-md font-bold text-on-surface uppercase tracking-tight">${escapeHtml(alert.type)}</div>
                </div>
            </div>
            <span class="font-data-mono text-[11px] text-on-surface-variant">${escapeHtml(time)}</span>
        </div>
        <p class="text-[13px] leading-relaxed text-on-surface-variant mb-3">${escapeHtml(alert.address || 'Vị trí không xác định')}</p>
        <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">${escapeHtml(alert.source || 'Community')}</span>
            <span class="font-label-caps text-[11px] text-${meta.color} group-hover:underline">OPEN_INTEL</span>
        </div>
    `;
    list.prepend(li);
    
    state.totalAlerts++;
    updateStats();
    while (list.children.length > 50) list.removeChild(list.lastChild);
}

function updateStats() {
    const elAlerts = $('stat-alerts'); if (elAlerts) elAlerts.textContent = state.totalAlerts;
    const elCameras = $('stat-cameras'); if (elCameras) elCameras.textContent = state.cameraMarkers.size;
}

function applyVisibility() {
    for (const { marker, type } of state.markers.values()) {
        const bucket = bucketOf(type);
        const visible = state.filters[bucket];
        const hasMarker = map.hasLayer(marker);
        if (visible && !hasMarker) marker.addTo(map);
        else if (!visible && hasMarker) map.removeLayer(marker);
    }
    updateIntelCharts();
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
        color: '#4cd7f6', weight: 2, fillOpacity: 0.1, dashArray: '5, 5'
    }).addTo(map);
}

async function notifyBrowser(msg) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* noop */ }
    }
    if (Notification.permission === 'granted') {
        new Notification('DisasterTraffic Command', { body: msg });
    }
}

// ====== Modal report ======
function openReportModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop overflow-y-auto pt-20 pb-10 px-4';
    backdrop.innerHTML = `
        <div class="modal max-w-2xl w-full glass-panel rounded-2xl border border-primary/20 shadow-2xl relative">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h3 class="font-headline-lg text-primary uppercase m-0">Report Incident</h3>
                    <p class="text-on-surface-variant font-label-caps text-[10px] m-0">Command Center Protocol v4.2</p>
                </div>
                <button id="r-close" class="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <span class="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
            </div>

            <div class="space-y-6">
                <div class="space-y-4">
                    <div class="flex items-center gap-3 border-b border-outline-variant/20 pb-2">
                        <span class="font-data-mono text-primary bg-primary/10 px-2 py-0.5 rounded text-[10px]">STEP 01</span>
                        <h4 class="font-headline-md text-on-surface text-base uppercase m-0">Incident Classification</h4>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" id="r-type-selector">
                        ${Object.entries(TYPE_META).map(([key, meta]) => `
                            <button data-type="${key}" class="r-type-btn flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5 transition-all group ${key === 'traffic' ? 'border-primary bg-primary/10' : ''}">
                                <div class="w-10 h-10 rounded-full bg-${meta.color}/20 flex items-center justify-center text-${meta.color} group-hover:scale-110 transition-transform">
                                    <span class="material-symbols-outlined text-2xl">${meta.icon}</span>
                                </div>
                                <span class="font-label-caps text-[10px] uppercase">${key}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="space-y-4">
                    <div class="flex items-center gap-3 border-b border-outline-variant/20 pb-2">
                        <span class="font-data-mono text-on-surface-variant bg-surface-variant/30 px-2 py-0.5 rounded text-[10px]">STEP 02</span>
                        <h4 class="font-headline-md text-on-surface text-base uppercase m-0">Intelligence Gathering</h4>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="block font-label-caps text-on-surface-variant text-[9px] uppercase">Description_Log</label>
                            <textarea id="r-desc" class="w-full bg-surface-container-low border border-outline-variant/30 focus:border-primary rounded-xl p-3 font-body-sm text-sm text-on-surface outline-none" placeholder="Provide situational details..." rows="3"></textarea>
                        </div>
                        <div class="space-y-2">
                            <label class="block font-label-caps text-on-surface-variant text-[9px] uppercase">Geospatial Fix</label>
                            <div class="grid grid-cols-2 gap-2">
                                <input id="r-lat" type="number" step="0.000001" readonly class="bg-surface-container-low border border-outline-variant/30 rounded-xl p-2 text-xs font-data-mono text-primary outline-none" placeholder="LAT" />
                                <input id="r-lon" type="number" step="0.000001" readonly class="bg-surface-container-low border border-outline-variant/30 rounded-xl p-2 text-xs font-data-mono text-primary outline-none" placeholder="LON" />
                            </div>
                            <input id="r-addr" type="text" class="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2 text-xs text-on-surface outline-none mt-2" placeholder="Street Address (Optional)" />
                            <p class="text-[9px] text-on-surface-variant italic mt-1">Click the map while this modal is open to pick coordinates.</p>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4 pt-4 border-t border-outline-variant/10">
                    <button id="r-cancel" class="flex-1 py-3 rounded-xl border border-outline-variant/30 font-label-caps text-[12px] text-on-surface-variant hover:bg-surface-variant/20 transition-all">CANCEL_LOG</button>
                    <button id="r-submit" class="flex-[2] py-3 rounded-xl bg-primary text-on-primary font-label-caps text-[12px] flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:scale-[1.02] transition-all">
                        TRANSMIT_REPORT
                        <span class="material-symbols-outlined text-lg">send</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    let selectedType = 'traffic';
    const typeBtns = backdrop.querySelectorAll('.r-type-btn');
    typeBtns.forEach(btn => {
        btn.onclick = () => {
            typeBtns.forEach(b => b.classList.remove('border-primary', 'bg-primary/10'));
            btn.classList.add('border-primary', 'bg-primary/10');
            selectedType = btn.dataset.type;
        };
    });

    const elLat = backdrop.querySelector('#r-lat');
    const elLon = backdrop.querySelector('#r-lon');

    function fillFromMap(e) {
        elLat.value = e.latlng.lat.toFixed(6);
        elLon.value = e.latlng.lng.toFixed(6);
        showToast('LOCATION_FIX_ACQUIRED');
    }
    map.on('click', fillFromMap);

    function close() {
        backdrop.remove();
        map.off('click', fillFromMap);
    }

    backdrop.querySelector('#r-close').onclick = close;
    backdrop.querySelector('#r-cancel').onclick = close;
    backdrop.querySelector('#r-submit').onclick = async () => {
        const payload = {
            type: selectedType,
            severity: 3,
            lat: Number(elLat.value),
            lng: Number(elLon.value),
            address: backdrop.querySelector('#r-addr').value.trim(),
            description: backdrop.querySelector('#r-desc').value.trim(),
        };
        if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
            showToast('GEOSPATIAL_FIX_REQUIRED');
            return;
        }
        try {
            const r = await fetch('/api/alerts/community', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) throw new Error('TRANSMIT_FAILURE');
            close();
            showToast('REPORT_TRANSMITTED_SUCCESSFULLY');
        } catch (e) {
            showToast('ERROR: ' + e.message);
        }
    };
}

// ====== Cameras ======
const CAMERA_STATUS_COLOR = {
    active: '#4cd7f6',  // cyan
    paused: '#9ca3af',  // gray
    broken: '#ef4444',  // red
    pending: '#f59e0b', // amber
};

function buildCameraIcon(status) {
    const color = CAMERA_STATUS_COLOR[status] || CAMERA_STATUS_COLOR.active;
    return L.divIcon({
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color}33;color:${color};display:flex;align-items:center;justify-content:center;border:1px solid ${color}88;box-shadow:0 0 10px ${color}33;font-size:14px"><span class="material-symbols-outlined" style="font-size:16px">videocam</span></div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });
}

function buildCameraPopup(cam) {
    const last = cam.lastAlertAt ? new Date(cam.lastAlertAt).toLocaleString('vi-VN') : 'chưa có';
    const events = (cam.allowedEventTypes || []).join(', ') || 'tất cả';
    return `
        <div class="p-1 font-body-md" style="min-width:240px">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary text-[18px]">videocam</span>
                    <span class="font-bold uppercase tracking-tight">${escapeHtml(cam.name)}</span>
                </div>
                <span class="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold border border-primary/20">${escapeHtml(cam.status || 'active').toUpperCase()}</span>
            </div>
            <div class="text-[13px] text-on-surface-variant">${escapeHtml(cam.address || 'Địa chỉ không xác định')}</div>
            <div class="mt-3 space-y-1">
                <div class="flex justify-between text-[11px]">
                    <span class="text-gray-500 uppercase font-label-caps">Events</span>
                    <span class="text-on-surface font-medium">${escapeHtml(events)}</span>
                </div>
                <div class="flex justify-between text-[11px]">
                    <span class="text-gray-500 uppercase font-label-caps">Last Signal</span>
                    <span class="text-on-surface font-medium">${escapeHtml(last)}</span>
                </div>
            </div>
            <button class="w-full mt-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[11px] font-bold uppercase transition-all" onclick="showCameraFeed('${cam._id}')">
                Open Intelligence Feed
            </button>
        </div>
    `;
}

window.showCameraFeed = (id) => {
    showToast('CONNECTING_TO_FEED: ' + id);
};

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
        updateStats();
        renderCCTVGrid();
        renderNodeList();
    } catch (e) {
        console.error('Lỗi tải camera:', e);
    }
}

// ====== Dynamic Rendering for New Views ======
function updateIntelCharts() {
    if (state.currentView !== 'intel') return;

    const trafficContainer = $('traffic-chart');
    if (trafficContainer) {
        trafficContainer.innerHTML = '';
        const counts = [40, 65, 55, 30, 90, 70, 45];
        const realCount = state.cacheAlerts.filter(a => a.type === 'traffic').length;
        counts[4] = Math.min(95, 80 + realCount); 
        
        counts.forEach(h => {
            const bar = document.createElement('div');
            bar.className = `bg-primary/${h > 70 ? '80' : '40'} w-full rounded-t-sm transition-all duration-1000`;
            bar.style.height = '0%';
            trafficContainer.appendChild(bar);
            setTimeout(() => bar.style.height = `${h}%`, 100);
        });
    }

    const barsContainer = $('disaster-bars');
    if (barsContainer) {
        barsContainer.innerHTML = '';
        const types = ['fire', 'flood', 'storm'];
        const total = state.cacheAlerts.length || 1;
        
        types.forEach(type => {
            const count = state.cacheAlerts.filter(a => bucketOf(a.type) === type).length;
            const pct = Math.round((count / total) * 100) || 5;
            const meta = TYPE_META[type] || TYPE_META.other;
            
            const div = document.createElement('div');
            div.className = 'flex items-center gap-4';
            div.innerHTML = `
                <span class="font-data-mono text-[10px] w-12 uppercase">${type}</span>
                <div class="flex-grow bg-surface-container-highest h-2 rounded-full overflow-hidden">
                    <div class="bg-${meta.color} h-full transition-all duration-1000" style="width: 0%"></div>
                </div>
                <span class="font-data-mono text-[10px]">${pct}%</span>
            `;
            barsContainer.appendChild(div);
            setTimeout(() => {
                const inner = div.querySelector('.h-full');
                if (inner) inner.style.width = `${pct}%`;
            }, 100);
        });
    }

    const logContainer = $('sector-logs');
    if (logContainer) {
        logContainer.innerHTML = '';
        state.cacheAlerts.slice(0, 10).forEach(alert => {
            const b = bucketOf(alert.type);
            const meta = TYPE_META[b] || TYPE_META.other;
            const div = document.createElement('div');
            div.className = `border-l-2 border-${meta.color} pl-3 py-1 mb-3`;
            const time = new Date(alert.createdAt).toLocaleTimeString('vi-VN');
            div.innerHTML = `
                <p class="font-data-mono text-[9px] text-${meta.color}">T+${time}</p>
                <p class="text-[11px] leading-tight">${escapeHtml(alert.description || alert.address)}</p>
            `;
            logContainer.appendChild(div);
        });
    }
}

function renderNodeList() {
    const list = $('node-list');
    if (!list) return;
    list.innerHTML = '';
    const cams = Array.from(state.cameraMarkers.entries()).slice(0, 5);
    cams.forEach(([id, item]) => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/10';
        const isBroken = item.status === 'broken';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-2.5 h-2.5 rounded-full bg-${isBroken ? 'error' : 'primary'} ${isBroken ? 'animate-pulse' : ''}"></div>
                <span class="font-data-mono text-[10px] truncate max-w-[120px] uppercase">${id.slice(-8)}</span>
            </div>
            <span class="text-[9px] ${isBroken ? 'text-error font-bold' : 'text-primary'}">${(item.status || 'active').toUpperCase()}</span>
        `;
        list.appendChild(div);
    });
}

function renderCCTVGrid() {
    const grid = $('cctv-grid');
    if (!grid || state.currentView !== 'cctv') return;
    grid.innerHTML = '';
    
    Array.from(state.cameraMarkers.entries()).forEach(([id, item]) => {
        const div = document.createElement('div');
        div.className = 'aspect-video glass-panel rounded-xl overflow-hidden relative group border-outline-variant/10 cursor-pointer';
        const isBroken = item.status === 'broken';
        
        div.innerHTML = `
            <div class="absolute top-2 left-2 z-10 flex items-center gap-2 bg-surface/80 px-2 py-1 rounded-md">
                <div class="w-1.5 h-1.5 rounded-full bg-${isBroken ? 'error' : 'primary'} ${isBroken ? 'animate-pulse' : ''}"></div>
                <span class="text-[9px] font-data-mono uppercase">CAM_${id.slice(-6)}</span>
            </div>
            ${isBroken ? `
                <div class="absolute inset-0 bg-surface/60 flex flex-col items-center justify-center z-10">
                    <span class="material-symbols-outlined text-error text-2xl mb-1">signal_disconnected</span>
                    <span class="text-[10px] font-bold text-error uppercase">Signal Lost</span>
                </div>
            ` : ''}
            <img class="w-full h-full object-cover grayscale ${isBroken ? 'opacity-20' : 'opacity-40 group-hover:grayscale-0 group-hover:opacity-100'} transition-all duration-500" 
                 src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=400" />
            <div class="scan-line absolute inset-0 opacity-10"></div>
        `;
        
        div.onclick = () => {
            $('selected-cam-id').textContent = `CAM_${id.slice(-8)}`;
            $('diag-signal').style.width = isBroken ? '0%' : '98.4%';
            $('diag-fps').textContent = isBroken ? '0' : '60';
            $('diag-loss').textContent = isBroken ? '100%' : '0.02%';
            showToast(`ACCESSING_NODE: ${id.slice(-8)}`);
        };
        grid.appendChild(div);
    });
}

function renderProfileData() {
    const user = getUser();
    const token = getToken();
    const sb = $('commander-name-sidebar'); if(sb) sb.textContent = state.commanderName;
    const mb = $('commander-name-main'); if(mb) mb.textContent = state.commanderName;
    
    if (user) {
        const cp = $('commander-plan'); if(cp) cp.textContent = getPlan().toUpperCase();
    }
    if (token) {
        const apiKey = $('api-key-view');
        if (apiKey) apiKey.value = token.slice(0, 16);
        const bearer = $('bearer-view');
        if (bearer) bearer.value = `Bearer ${token}`;
    }
}

function switchView(viewId) {
    state.currentView = viewId;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const target = $(`view-${viewId}`);
    if (target) target.classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('text-primary', 'bg-primary/10');
        item.classList.add('text-on-surface-variant', 'hover:text-primary', 'hover:bg-white/5');
    });
    const activeNav = $(`nav-${viewId}`);
    if (activeNav) {
        activeNav.classList.add('text-primary', 'bg-primary/10');
        activeNav.classList.remove('text-on-surface-variant', 'hover:text-primary', 'hover:bg-white/5');
    }

    if (viewId === 'intel') updateIntelCharts();
    if (viewId === 'cctv') renderCCTVGrid();
    if (viewId === 'profile') renderProfileData();
    
    showToast(`PROTOCOL_ENGAGED: ${viewId.toUpperCase()}_VIEW`);
}

// ====== Initial load ======
async function loadHistoryAlerts() {
    try {
        const limit = alertLimitByPlan();
        const response = await fetch(`/api/alerts?limit=${limit}`);
        const alerts = await response.json();
        if (!Array.isArray(alerts)) return;
        alerts.reverse().forEach((alert) => {
            state.cacheAlerts.push(alert);
            addAlertMarker(alert);
            addAlertToSidebar(alert);
        });
        updateIntelCharts();
    } catch (error) {
        console.error('Lỗi tải lịch sử cảnh báo:', error);
    }
}

// ====== Wire UI ======
$('toggle-traffic')?.addEventListener('change', (e) => {
    if (e.target.checked) trafficLayer.addTo(map);
    else map.removeLayer(trafficLayer);
});

['fire', 'flood', 'traffic', 'other'].forEach((bucket) => {
    const el = $(`toggle-${bucket}`);
    if (!el) return;
    el.addEventListener('change', (e) => {
        state.filters[bucket] = e.target.checked;
        applyVisibility();
    });
});

$('btn-add-report')?.addEventListener('click', () => openReportModal());

$('btn-subscribe')?.addEventListener('click', () => {
    state.subscribeMode = true;
    state.subscribePoints = [];
    showToast('Click 2 điểm trên bản đồ để chọn vùng theo dõi.');
});
$('btn-clear-subscribe')?.addEventListener('click', () => {
    state.subscribedBbox = null;
    saveSubscribedBbox(null);
    drawSubscribeBbox();
    updateSubStatus();
    showToast('Đã xoá vùng theo dõi.');
});

// ====== Navigation ======
$('nav-map')?.addEventListener('click', () => switchView('map'));
$('nav-intel')?.addEventListener('click', () => switchView('intel'));
$('nav-cctv')?.addEventListener('click', () => switchView('cctv'));
$('nav-profile')?.addEventListener('click', () => switchView('profile'));

// ====== Realtime ======
const socket = io();

socket.on('connect', () => {
    const el = $('connection-status');
    if (el) {
        el.classList.replace('text-outline', 'text-primary');
        el.title = 'Connected';
    }
});
socket.on('disconnect', () => {
    const el = $('connection-status');
    if (el) {
        el.classList.replace('text-primary', 'text-outline');
        el.title = 'Disconnected';
    }
});

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
    updateIntelCharts();

    if (alert.lat != null && alert.lng != null && state.currentView === 'map') {
        map.panTo([alert.lat, alert.lng]);
    }

    if (state.subscribedBbox && withinBbox(alert.lng, alert.lat, state.subscribedBbox)) {
        notifyBrowser(`${alert.type}: ${alert.address || ''}`);
    }
});

function getToken() { return localStorage.getItem('token'); }

// ====== Auth UI ======
function renderAuthBar() {
    const bar = document.getElementById('auth-bar');
    if (!bar) return;

    if (!isLoggedIn()) {
        bar.innerHTML = `<a href="/login.html" class="px-4 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold rounded-lg border border-primary/30 transition-all">SIGN_IN</a>`;
        return;
    }

    const user = getUser();
    const plan = getPlan();
    bar.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="text-right">
                <div class="text-[10px] font-bold text-on-surface leading-none">${escapeHtml(user.name)}</div>
                <div class="text-[9px] font-data-mono text-primary">${plan.toUpperCase()}</div>
            </div>
            <button id="btn-logout" class="p-1.5 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-error transition-all">
                <span class="material-symbols-outlined text-sm">logout</span>
            </button>
        </div>`;

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        clearAuth();
        window.location.reload();
    });
}

function alertLimitByPlan() {
    const plan = getPlan();
    if (plan === 'enterprise') return 500;
    if (plan === 'pro') return 200;
    return 50;
}

// Map interactions
map.on('click', (e) => {
    if (!state.subscribeMode) return;
    state.subscribePoints.push([e.latlng.lng, e.latlng.lat]);
    showToast(`Điểm ${state.subscribePoints.length}/2`);
    if (state.subscribePoints.length === 2) {
        state.subscribedBbox = bboxFromTwoPoints(state.subscribePoints[0], state.subscribePoints[1]);
        saveSubscribedBbox(state.subscribedBbox);
        state.subscribeMode = false;
        drawSubscribeBbox();
        updateSubStatus();
        showToast('Đã thiết lập vùng theo dõi!');
    }
});

// ====== Boot ======
renderAuthBar();
updateSubStatus();
drawSubscribeBbox();
loadHistoryAlerts();
loadCameras();
renderProfileData();

setInterval(() => {
    const stream = $('data-stream');
    if (stream && state.currentView === 'intel') {
        const hex = Math.random().toString(16).slice(2, 10).toUpperCase();
        const p = document.createElement('p');
        p.textContent = `RAW >> 0x${hex} | PKT_RECV | NODE_SYNC_OK`;
        stream.prepend(p);
        if (stream.children.length > 5) stream.lastElementChild.remove();
    }
}, 2000);
