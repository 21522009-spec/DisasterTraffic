import { isLoggedIn, getUser, getPlan, getToken, clearAuth, redirectToLogin, PLAN_LABEL, PLAN_COLOR } from '/js/auth.js';

const $ = (id) => document.getElementById(id);

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
        ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

async function apiFetch(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
    if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = (await r.json()).error || msg; } catch {}
        throw new Error(msg);
    }
    return r.json();
}

// ====== Auth gate ======
function initAuth() {
    const statusEl  = $('auth-status');
    const gate      = $('upgrade-gate');
    const formSec   = document.querySelector('section:nth-of-type(2)'); // Add/Edit section

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

    $('btn-logout')?.addEventListener('click', () => { clearAuth(); window.location.href = '/'; });

    if (plan !== 'enterprise') {
        gate.classList.remove('hidden');
        if (formSec) formSec.classList.add('hidden');
        document.querySelector('section:nth-of-type(3)')?.classList.add('hidden');
        return false;
    }

    return true;
}

// ====== Form ======
function getFormData() {
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

function fillForm(cam) {
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

function resetForm() {
    $('cam-form').reset();
    $('f-id').value = '';
    $('f-cooldown').value = 60000;
    $('btn-submit').textContent = 'Tạo mới';
    document.querySelectorAll('.evt').forEach((el) => (el.checked = false));
}

$('btn-reset-form').addEventListener('click', (e) => {
    e.preventDefault();
    resetForm();
});

$('cam-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('f-id').value;
    const payload = getFormData();

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
        resetForm();
        loadCameras();
    } catch (err) {
        showToast('Lỗi: ' + err.message, false);
    }
});

// ====== List ======
async function loadCameras() {
    const list = $('cam-list');
    list.innerHTML = '<div class="p-4 text-gray-500 text-sm">Đang tải...</div>';
    try {
        const cams = await apiFetch('/api/cameras?limit=500');
        list.innerHTML = '';
        if (!cams.length) {
            $('cam-empty').classList.remove('hidden');
            return;
        }
        $('cam-empty').classList.add('hidden');
        cams.forEach((cam) => list.appendChild(renderRow(cam)));
    } catch (err) {
        list.innerHTML = `<div class="p-4 text-red-600 text-sm">Lỗi tải: ${escapeHtml(err.message)}</div>`;
    }
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

function renderRow(cam) {
    const div = document.createElement('div');
    div.className = 'p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';

    const events = (cam.allowedEventTypes || []).join(', ') || 'tất cả';
    const last = cam.lastAlertAt
        ? new Date(cam.lastAlertAt).toLocaleString('vi-VN')
        : 'chưa có';

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
        <div class="flex gap-2 shrink-0">
            <button class="btn-edit text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Sửa</button>
            <button class="btn-del text-sm px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">Xoá</button>
        </div>
    `;

    div.querySelector('.btn-edit').addEventListener('click', () => {
        fillForm(cam);
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

$('btn-reload').addEventListener('click', loadCameras);

// ====== Boot ======
if (initAuth()) {
    loadCameras();
}
