import {
    isLoggedIn,
    getUser,
    getPlan,
    getToken,
    clearAuth,
    redirectToLogin,
    PLAN_LABEL,
    PLAN_COLOR,
} from '/js/auth.js';

const $ = (id) => document.getElementById(id);

const state = {
    cameras: [],
    scanJobs: [],
    expandedJobs: new Set(),
};

// ====== Helpers ======
function showToast(msg, ok = true) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.background = ok ? '#111827' : '#b91c1c';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

function escapeHtml(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function authHeaders() {
    const token = getToken();
    return token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

async function apiFetch(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
    if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = (await r.json()).error || msg; } catch {}
        throw new Error(msg);
    }
    if (r.status === 204) return null;
    return r.json();
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('vi-VN');
}

function formatSeconds(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return `${Number(value).toFixed(1)}s`;
}

function enterpriseSections() {
    return [
        $('camera-form-section'),
        $('camera-list-section'),
        $('scan-form-section'),
        $('scan-jobs-section'),
    ].filter(Boolean);
}

// ====== Auth gate ======
function initAuth() {
    const statusEl = $('auth-status');
    const gate = $('upgrade-gate');

    if (!isLoggedIn()) {
        redirectToLogin();
        return false;
    }

    const user = getUser();
    const plan = getPlan();
    statusEl.innerHTML = `
        <div class="flex items-center justify-between">
            <span>Xin chào, <strong>${escapeHtml(user.name)}</strong>
                <span class="ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLOR[plan]}">${PLAN_LABEL[plan]}</span>
            </span>
            <button id="btn-logout" class="text-xs text-gray-400 hover:text-red-500">Đăng xuất</button>
        </div>`;

    $('btn-logout')?.addEventListener('click', () => {
        clearAuth();
        window.location.href = '/';
    });

    if (plan !== 'enterprise') {
        gate.classList.remove('hidden');
        enterpriseSections().forEach((section) => section.classList.add('hidden'));
        return false;
    }

    gate.classList.add('hidden');
    enterpriseSections().forEach((section) => section.classList.remove('hidden'));
    return true;
}

// ====== Camera form ======
function getCameraFormData() {
    const events = Array.from(document.querySelectorAll('.evt:checked')).map((el) => el.value);
    return {
        name: $('f-name').value.trim(),
        kind: $('f-kind').value,
        streamUrl: $('f-streamUrl').value.trim(),
        lat: parseFloat($('f-lat').value),
        lng: parseFloat($('f-lng').value),
        address: $('f-address').value.trim(),
        status: $('f-status').value,
        cooldownMs: parseInt($('f-cooldown').value, 10) || 60000,
        notes: $('f-notes').value.trim(),
        allowedEventTypes: events,
    };
}

function fillCameraForm(cam) {
    $('f-id').value = cam._id;
    $('f-name').value = cam.name || '';
    $('f-kind').value = cam.kind || 'mock';
    $('f-streamUrl').value = cam.streamUrl || '';
    $('f-lat').value = cam.lat ?? '';
    $('f-lng').value = cam.lng ?? '';
    $('f-address').value = cam.address || '';
    $('f-status').value = cam.status || 'active';
    $('f-cooldown').value = cam.cooldownMs ?? 60000;
    $('f-notes').value = cam.notes || '';

    document.querySelectorAll('.evt').forEach((el) => {
        el.checked = (cam.allowedEventTypes || []).includes(el.value);
    });

    $('btn-submit').textContent = 'Cập nhật';
}

function resetCameraForm() {
    $('cam-form').reset();
    $('f-id').value = '';
    $('f-cooldown').value = 60000;
    $('btn-submit').textContent = 'Tạo mới';
    document.querySelectorAll('.evt').forEach((el) => {
        el.checked = false;
    });
}

function inferSourceTypeFromCamera(cam) {
    const url = String(cam?.streamUrl || '').toLowerCase();
    if (cam?.kind === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
        return 'youtube-vod';
    }
    if (cam?.kind === 'rtsp' || url.startsWith('rtsp://')) return 'rtsp-live';
    if (url.startsWith('mock://') || url.endsWith('.mp4') || /^[a-z]:\\/i.test(url)) {
        return 'file';
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return 'direct-url';
    }
    return 'file';
}

function populateCameraSelect() {
    const select = $('s-cameraId');
    const current = select.value;
    select.innerHTML = '<option value="">Chọn camera</option>';
    state.cameras.forEach((cam) => {
        const opt = document.createElement('option');
        opt.value = cam._id;
        opt.textContent = `${cam.name} (${cam.kind || 'camera'})`;
        select.appendChild(opt);
    });
    if (state.cameras.some((cam) => cam._id === current)) {
        select.value = current;
    }
}

function prefillScanFromCamera(cam) {
    $('s-cameraId').value = cam._id;
    $('s-sourceType').value = inferSourceTypeFromCamera(cam);
    $('s-sourceUrl').value = cam.streamUrl || '';
    $('s-sourceLabel').value = cam.name || '';
    document.querySelectorAll('.scan-evt').forEach((el) => {
        el.checked = (cam.allowedEventTypes || []).includes(el.value);
    });
    $('scan-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function statusBadge(s) {
    const colors = {
        active: 'bg-green-100 text-green-700',
        paused: 'bg-gray-100 text-gray-600',
        broken: 'bg-red-100 text-red-700',
        pending: 'bg-amber-100 text-amber-700',
    };
    return `<span class="text-xs px-2 py-0.5 rounded-full ${colors[s] || colors.active}">${escapeHtml(s)}</span>`;
}

function renderCameraRow(cam) {
    const div = document.createElement('div');
    div.className = 'p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';

    const events = (cam.allowedEventTypes || []).join(', ') || 'tất cả';
    const last = cam.lastAlertAt ? new Date(cam.lastAlertAt).toLocaleString('vi-VN') : 'chưa có';

    div.innerHTML = `
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold">📷 ${escapeHtml(cam.name)}</span>
                ${statusBadge(cam.status)}
                <span class="text-xs text-gray-500">${escapeHtml(cam.kind || '')}</span>
            </div>
            <div class="text-sm text-gray-600 mt-1">${escapeHtml(cam.address || '—')}</div>
            <div class="text-xs text-gray-500 mt-1">
                <span class="font-mono">${escapeHtml(cam.streamUrl || '')}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">
                Toạ độ: ${cam.lat?.toFixed(5)}, ${cam.lng?.toFixed(5)} ·
                Sự kiện: ${escapeHtml(events)} ·
                Báo gần nhất: ${escapeHtml(last)}
            </div>
        </div>
        <div class="flex gap-2 shrink-0 flex-wrap">
            <button class="btn-scan text-sm px-3 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100">Quét video</button>
            <button class="btn-edit text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Sửa</button>
            <button class="btn-del text-sm px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">Xoá</button>
        </div>
    `;

    div.querySelector('.btn-scan').addEventListener('click', () => {
        prefillScanFromCamera(cam);
        showToast(`Đã nạp camera "${cam.name}" vào form scan.`);
    });

    div.querySelector('.btn-edit').addEventListener('click', () => {
        fillCameraForm(cam);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    div.querySelector('.btn-del').addEventListener('click', async () => {
        if (!confirm(`Xoá camera "${cam.name}"?`)) return;
        try {
            await apiFetch(`/api/cameras/${cam._id}`, { method: 'DELETE' });
            showToast('Đã xoá.');
            loadCameras();
        } catch (err) {
            showToast('Lỗi: ' + err.message, false);
        }
    });

    return div;
}

async function loadCameras() {
    const list = $('cam-list');
    list.innerHTML = '<div class="p-4 text-gray-500 text-sm">Đang tải...</div>';
    try {
        const cams = await apiFetch('/api/cameras?limit=500');
        state.cameras = Array.isArray(cams) ? cams : [];
        populateCameraSelect();

        list.innerHTML = '';
        if (!state.cameras.length) {
            $('cam-empty').classList.remove('hidden');
            return;
        }

        $('cam-empty').classList.add('hidden');
        state.cameras.forEach((cam) => list.appendChild(renderCameraRow(cam)));
    } catch (err) {
        list.innerHTML = `<div class="p-4 text-red-600 text-sm">Lỗi tải: ${escapeHtml(err.message)}</div>`;
    }
}

// ====== Scan jobs ======
function getScanFormData() {
    const allowedEventTypes = Array.from(document.querySelectorAll('.scan-evt:checked')).map((el) => el.value);
    return {
        cameraId: $('s-cameraId').value,
        sourceType: $('s-sourceType').value,
        sourceUrl: $('s-sourceUrl').value.trim(),
        sourceLabel: $('s-sourceLabel').value.trim(),
        allowedEventTypes,
        publishAlerts: $('s-publishAlerts').checked,
        notes: $('s-notes').value.trim(),
        config: {
            scanEverySec: parseFloat($('s-scanEverySec').value),
            mergeGapSec: parseFloat($('s-mergeGapSec').value),
            clipBeforeSec: parseFloat($('s-clipBeforeSec').value),
            clipAfterSec: parseFloat($('s-clipAfterSec').value),
            artifactFps: parseInt($('s-artifactFps').value, 10),
            verifyWithLlm: $('s-verifyWithLlm').checked,
        },
    };
}

function resetScanForm() {
    $('scan-form').reset();
    $('s-sourceType').value = 'file';
    $('s-publishAlerts').checked = true;
    $('s-verifyWithLlm').checked = true;
    $('s-scanEverySec').value = 2;
    $('s-mergeGapSec').value = 8;
    $('s-clipBeforeSec').value = 12;
    $('s-clipAfterSec').value = 12;
    $('s-artifactFps').value = 6;
    document.querySelectorAll('.scan-evt').forEach((el) => {
        el.checked = false;
    });
}

function jobStatusBadge(status) {
    const colors = {
        queued: 'bg-slate-100 text-slate-700',
        running: 'bg-blue-100 text-blue-700',
        succeeded: 'bg-green-100 text-green-700',
        failed: 'bg-red-100 text-red-700',
        cancelled: 'bg-amber-100 text-amber-700',
    };
    return `<span class="text-xs px-2 py-0.5 rounded-full ${colors[status] || colors.queued}">${escapeHtml(status)}</span>`;
}

function renderArtifactLinks(evt) {
    const links = [
        evt.snapshotUrl ? `<a href="${escapeHtml(evt.snapshotUrl)}" target="_blank" class="text-blue-600 hover:underline">snapshot</a>` : '',
        evt.clipBeforeUrl ? `<a href="${escapeHtml(evt.clipBeforeUrl)}" target="_blank" class="text-blue-600 hover:underline">before</a>` : '',
        evt.clipDuringUrl ? `<a href="${escapeHtml(evt.clipDuringUrl)}" target="_blank" class="text-blue-600 hover:underline">during</a>` : '',
        evt.clipAfterUrl ? `<a href="${escapeHtml(evt.clipAfterUrl)}" target="_blank" class="text-blue-600 hover:underline">after</a>` : '',
    ].filter(Boolean);
    return links.length ? links.join(' · ') : '<span class="text-gray-400">chưa có artifact</span>';
}

function renderEventCard(evt) {
    const div = document.createElement('div');
    div.className = 'border rounded-lg p-3 bg-gray-50';
    const alertInfo = evt.alertId?._id
        ? `<span class="text-xs text-green-700">alert=${escapeHtml(evt.alertId._id)}</span>`
        : '<span class="text-xs text-gray-400">chưa publish alert</span>';

    div.innerHTML = `
        <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold uppercase">${escapeHtml(evt.type)}</span>
                <span class="text-xs px-2 py-0.5 rounded bg-white border">${escapeHtml(evt.status || 'candidate')}</span>
                <span class="text-xs text-gray-500">conf=${Math.round((evt.confidence || 0) * 100)}%</span>
                ${evt.verified ? `<span class="text-xs text-emerald-700">verified:${escapeHtml(evt.verifiedBy || 'yes')}</span>` : '<span class="text-xs text-gray-400">unverified</span>'}
            </div>
            ${alertInfo}
        </div>
        <div class="text-sm text-gray-700 mt-2">${escapeHtml(evt.title || evt.description || 'Không có mô tả')}</div>
        <div class="text-xs text-gray-500 mt-1">
            ${formatSeconds(evt.eventStartSec)} → ${formatSeconds(evt.eventEndSec)}
            ${evt.snapshotSec != null ? ` · snapshot @ ${formatSeconds(evt.snapshotSec)}` : ''}
        </div>
        <div class="text-xs text-gray-500 mt-1">${renderArtifactLinks(evt)}</div>
        ${evt.snapshotUrl ? `<img src="${escapeHtml(evt.snapshotUrl)}" alt="snapshot" class="mt-3 rounded border max-h-44 object-cover">` : ''}
    `;
    return div;
}

async function toggleScanJobEvents(jobId, host, button) {
    if (state.expandedJobs.has(jobId)) {
        state.expandedJobs.delete(jobId);
        host.innerHTML = '';
        host.classList.add('hidden');
        button.textContent = 'Xem events';
        return;
    }

    host.classList.remove('hidden');
    host.innerHTML = '<div class="text-sm text-gray-500">Đang tải events...</div>';
    button.textContent = 'Ẩn events';

    try {
        const events = await apiFetch(`/api/scan-jobs/${jobId}/events?limit=200`);
        state.expandedJobs.add(jobId);
        host.innerHTML = '';

        if (!Array.isArray(events) || !events.length) {
            host.innerHTML = '<div class="text-sm text-gray-500">Chưa có event nào.</div>';
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'grid gap-3';
        events.forEach((evt) => wrapper.appendChild(renderEventCard(evt)));
        host.appendChild(wrapper);
    } catch (err) {
        host.innerHTML = `<div class="text-sm text-red-600">Lỗi tải events: ${escapeHtml(err.message)}</div>`;
        button.textContent = 'Xem events';
        state.expandedJobs.delete(jobId);
    }
}

function renderScanJobRow(job) {
    const div = document.createElement('div');
    div.className = 'p-4';

    const camera = job.camera || job.cameraId || {};
    const progressPct = Math.round(job.progress?.pct || 0);
    const counts = `events=${job.result?.eventsCount ?? 0} · alerts=${job.result?.alertsCount ?? 0}`;
    const config = job.config || {};
    const timings = [
        `sample ${config.scanEverySec ?? 2}s`,
        `merge ${config.mergeGapSec ?? 8}s`,
        `clip -${config.clipBeforeSec ?? 12}/+${config.clipAfterSec ?? 12}s`,
    ].join(' · ');

    div.innerHTML = `
        <div class="flex flex-col gap-3">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold">${escapeHtml(camera.name || 'Camera đã xoá')}</span>
                        ${jobStatusBadge(job.status)}
                        <span class="text-xs text-gray-500">${escapeHtml(job.sourceType || '')}</span>
                    </div>
                    <div class="text-sm text-gray-600 mt-1">${escapeHtml(job.sourceLabel || camera.address || '—')}</div>
                    <div class="text-xs text-gray-500 mt-1 font-mono break-all">${escapeHtml(job.sourceUrl || '')}</div>
                    <div class="text-xs text-gray-500 mt-1">
                        ${counts} · ${timings}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        Queue: ${formatDateTime(job.requestedAt || job.createdAt)} ·
                        Start: ${formatDateTime(job.startedAt)} ·
                        End: ${formatDateTime(job.completedAt)}
                    </div>
                    ${job.result?.summary ? `<div class="text-sm text-gray-700 mt-2">${escapeHtml(job.result.summary)}</div>` : ''}
                    ${job.error?.message ? `<div class="text-sm text-red-600 mt-2">${escapeHtml(job.error.message)}</div>` : ''}
                </div>
                <div class="flex flex-col items-end gap-2 shrink-0">
                    <div class="text-sm font-medium text-gray-700">${progressPct}%</div>
                    <div class="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-600" style="width:${progressPct}%"></div>
                    </div>
                    <button class="btn-events text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200">Xem events</button>
                </div>
            </div>
            <div class="job-events hidden pt-2 border-t"></div>
        </div>
    `;

    const button = div.querySelector('.btn-events');
    const host = div.querySelector('.job-events');
    button.addEventListener('click', () => toggleScanJobEvents(job._id, host, button));

    return div;
}

async function loadScanJobs() {
    const list = $('scan-job-list');
    list.innerHTML = '<div class="p-4 text-gray-500 text-sm">Đang tải scan jobs...</div>';
    try {
        const jobs = await apiFetch('/api/scan-jobs?limit=100');
        state.scanJobs = Array.isArray(jobs) ? jobs : [];
        list.innerHTML = '';

        if (!state.scanJobs.length) {
            $('scan-job-empty').classList.remove('hidden');
            return;
        }

        $('scan-job-empty').classList.add('hidden');
        state.scanJobs.forEach((job) => list.appendChild(renderScanJobRow(job)));
    } catch (err) {
        list.innerHTML = `<div class="p-4 text-red-600 text-sm">Lỗi tải: ${escapeHtml(err.message)}</div>`;
    }
}

// ====== Wire events ======
$('btn-reset-form')?.addEventListener('click', (e) => {
    e.preventDefault();
    resetCameraForm();
});

$('cam-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('f-id').value;
    const payload = getCameraFormData();

    if (!isLoggedIn()) {
        showToast('Vui lòng đăng nhập.', false);
        return;
    }

    try {
        if (id) {
            await apiFetch(`/api/cameras/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
            showToast('Đã cập nhật camera.');
        } else {
            await apiFetch('/api/cameras', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            showToast('Đã tạo camera mới.');
        }
        resetCameraForm();
        loadCameras();
    } catch (err) {
        showToast('Lỗi: ' + err.message, false);
    }
});

$('btn-reset-scan-form')?.addEventListener('click', (e) => {
    e.preventDefault();
    resetScanForm();
});

$('scan-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = getScanFormData();

    if (!payload.cameraId) {
        showToast('Chọn camera trước khi submit scan job.', false);
        return;
    }

    try {
        await apiFetch('/api/scan-jobs', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        showToast('Đã tạo scan job.');
        resetScanForm();
        loadScanJobs();
    } catch (err) {
        showToast('Lỗi: ' + err.message, false);
    }
});

$('btn-reload')?.addEventListener('click', loadCameras);
$('btn-reload-jobs')?.addEventListener('click', loadScanJobs);

// ====== Boot ======
if (initAuth()) {
    resetScanForm();
    loadCameras();
    loadScanJobs();
}
