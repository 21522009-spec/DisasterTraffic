/**
 * Đếm số lần đăng nhập sai theo email để chống brute-force.
 * 5 lần fail trong 15 phút thì khoá 30 phút. Login OK thì reset.
 * Lưu in-memory, reset khi server restart (đủ cho traffic nhỏ).
 */

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
const WINDOW_MS = (Number(process.env.LOGIN_WINDOW_MIN) || 15) * 60 * 1000;
const LOCKOUT_MS = (Number(process.env.LOGIN_LOCKOUT_MIN) || 30) * 60 * 1000;

const _attempts = new Map();

function _norm(email) {
    return String(email || '').toLowerCase().trim();
}

/**
 * Trả { locked: bool, remainingMs?: number }.
 * Tự dọn record nếu lockout đã hết.
 */
export function checkLockout(email) {
    const key = _norm(email);
    if (!key) return { locked: false };

    const rec = _attempts.get(key);
    if (!rec) return { locked: false };

    const now = Date.now();
    if (rec.lockedUntil && now < rec.lockedUntil) {
        return { locked: true, remainingMs: rec.lockedUntil - now };
    }
    if (rec.lockedUntil && now >= rec.lockedUntil) {
        _attempts.delete(key);
    }
    return { locked: false };
}

/** Ghi 1 lần fail. Khi đạt MAX_ATTEMPTS → khoá. Trả số lần fail trong window. */
export function recordFail(email) {
    const key = _norm(email);
    if (!key) return 0;

    const now = Date.now();
    let rec = _attempts.get(key);
    if (!rec || now - rec.firstAt > WINDOW_MS) {
        rec = { count: 0, firstAt: now, lockedUntil: 0 };
    }
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
        rec.lockedUntil = now + LOCKOUT_MS;
    }
    _attempts.set(key, rec);
    return rec.count;
}

/** Login thành công — xóa record. */
export function recordSuccess(email) {
    _attempts.delete(_norm(email));
}

/** Periodic cleanup — gọi từ cron nếu muốn (optional). */
export function pruneExpired() {
    const now = Date.now();
    for (const [k, v] of _attempts.entries()) {
        if (
            (v.lockedUntil && now >= v.lockedUntil) ||
            (!v.lockedUntil && now - v.firstAt > WINDOW_MS)
        ) {
            _attempts.delete(k);
        }
    }
}
