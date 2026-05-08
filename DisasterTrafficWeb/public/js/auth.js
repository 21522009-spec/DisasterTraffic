/**
 * Auth utilities dùng chung cho index.html, admin.html.
 * Lưu JWT + user info vào localStorage.
 */

const TOKEN_KEY = 'dt_token';
const USER_KEY  = 'dt_user';

export function getToken()  { return localStorage.getItem(TOKEN_KEY); }
export function getUser()   {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
export function isLoggedIn() { return !!getToken(); }
export function getPlan()    { return getUser()?.plan || 'free'; }

export function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

export function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Redirect về login, giữ return URL để sau khi login quay lại */
export function redirectToLogin() {
    const ret = encodeURIComponent(window.location.pathname);
    window.location.href = `/login.html?return=${ret}`;
}

export const PLAN_LABEL = { free: 'Miễn phí', pro: 'Chuyên nghiệp', enterprise: 'Tổ chức' };
export const PLAN_COLOR = {
    free:       'bg-gray-100 text-gray-600',
    pro:        'bg-blue-100 text-blue-700',
    enterprise: 'bg-amber-100 text-amber-700',
};
