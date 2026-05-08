import * as SecureStore from 'expo-secure-store';

import { API_BASE } from './config';

/**
 * Auth cho mobile: login / register / logout / fetchMe + đọc token + user
 * đã lưu. Token và user lưu encrypted qua expo-secure-store.
 * Cài: npx expo install expo-secure-store
 */

const TOKEN_KEY = 'dt_auth_token';
const USER_KEY = 'dt_auth_user';

export type AuthPlan = 'free' | 'pro' | 'enterprise';

export interface AuthUser {
    _id: string;
    name: string;
    email: string;
    plan: AuthPlan;
    planExpiresAt?: string | null;
}

export interface AuthResult {
    token: string;
    user: AuthUser;
}

// Storage helpers
async function _getString(key: string): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(key);
    } catch {
        return null;
    }
}

async function _setString(key: string, value: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(key, value);
    } catch (e) {
        console.warn('[auth] secure-store set error:', e);
    }
}

async function _delete(key: string): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(key);
    } catch {
        /* noop */
    }
}

// Đọc state đã lưu
export async function getToken(): Promise<string | null> {
    return _getString(TOKEN_KEY);
}

export async function getUser(): Promise<AuthUser | null> {
    const raw = await _getString(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AuthUser;
    } catch {
        return null;
    }
}

export async function isLoggedIn(): Promise<boolean> {
    return Boolean(await getToken());
}

// Gọi backend (không dùng api.ts để tránh circular import)
async function _post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(body),
    });

    let json: any = null;
    try {
        json = await r.json();
    } catch {
        /* response không phải JSON */
    }

    if (!r.ok) {
        const msg = json?.error || `HTTP ${r.status}`;
        throw new Error(msg);
    }
    return json as T;
}

async function _persist(result: AuthResult): Promise<void> {
    await _setString(TOKEN_KEY, result.token);
    await _setString(USER_KEY, JSON.stringify(result.user));
}

// Auth actions
export async function login(email: string, password: string): Promise<AuthResult> {
    const result = await _post<AuthResult>('/auth/login', { email, password });
    await _persist(result);
    return result;
}

export async function register(
    name: string,
    email: string,
    password: string
): Promise<AuthResult> {
    const result = await _post<AuthResult>('/auth/register', {
        name,
        email,
        password,
    });
    await _persist(result);
    return result;
}

export async function logout(): Promise<void> {
    await _delete(TOKEN_KEY);
    await _delete(USER_KEY);
}

export async function fetchMe(): Promise<AuthUser | null> {
    const token = await getToken();
    if (!token) return null;

    try {
        const r = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true',
            },
        });
        if (r.status === 401) {
            // Token hết hạn → tự logout
            await logout();
            return null;
        }
        if (!r.ok) return null;
        const user: AuthUser = await r.json();
        // Refresh user info trong storage
        await _setString(USER_KEY, JSON.stringify(user));
        return user;
    } catch {
        return null;
    }
}
