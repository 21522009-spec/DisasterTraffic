import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { API_BASE } from './config';
import { getToken } from './auth';

/**
 * Setup push notification.
 *
 * Quy trình:
 *   1. Set handler hiển thị notification khi app đang foreground
 *   2. Xin permission notification
 *   3. Get Expo push token (ExponentPushToken[...])
 *   4. POST token lên backend (/api/devices/register) để backend gửi push
 *
 * Lưu ý:
 *   - iOS Expo Go KHÔNG hỗ trợ push (Apple chặn). Cần Development Build.
 *   - Android Expo Go OK bình thường.
 *   - Hàm này nên gọi 1 lần khi app khởi động (vd trong _layout.tsx).
 */

// Hiển thị banner + sound khi app đang mở
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

async function getExpoPushToken(): Promise<string | null> {
    if (!Device.isDevice) {
        console.warn('[push] Not a real device — push không hoạt động trên simulator/web.');
        return null;
    }

    // Android cần channel để nhận notification
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#1d4ed8',
        });
    }

    // Xin permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        console.warn('[push] Permission bị từ chối.');
        return null;
    }

    // Get token
    try {
        const tokenResponse = await Notifications.getExpoPushTokenAsync();
        return tokenResponse.data;
    } catch (e) {
        console.warn('[push] getExpoPushToken error:', e);
        return null;
    }
}

async function registerTokenWithBackend(token: string): Promise<void> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
        };
        // Gắn JWT nếu user đã login — backend có thể link device với userId
        const jwt = await getToken();
        if (jwt) {
            headers.Authorization = `Bearer ${jwt}`;
        }

        const r = await fetch(`${API_BASE}/devices/register`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                token,
                platform: Platform.OS,
            }),
        });
        if (!r.ok) {
            console.warn(`[push] register backend HTTP ${r.status}`);
        } else {
            console.log('[push] device registered.');
        }
    } catch (e) {
        console.warn('[push] register backend error:', e);
    }
}

/**
 * Public — gọi 1 lần khi app khởi động.
 * Trả token nếu thành công, null nếu không.
 */
export async function setupPushNotifications(): Promise<string | null> {
    const token = await getExpoPushToken();
    if (!token) return null;

    console.log('[push] Expo push token:', token);
    await registerTokenWithBackend(token);
    return token;
}

/** Listener cho khi user tap vào notification — dùng nếu cần navigate. */
export function addNotificationResponseListener(
    handler: (response: Notifications.NotificationResponse) => void
) {
    return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Khi user tap notification, điều hướng tới alert tương ứng.
 * Backend đã gửi data { alertId, type, lat, lng } trong payload notification.
 */
export function setupNotificationDeepLink() {
    return addNotificationResponseListener((response) => {
        const data = response.notification.request.content.data as
            | { alertId?: string; type?: string; lat?: number; lng?: number }
            | undefined;

        if (!data) return;

        if (data.alertId) {
            router.push(`/(tabs)/explore?alertId=${encodeURIComponent(data.alertId)}`);
            return;
        }
        if (typeof data.lat === 'number' && typeof data.lng === 'number') {
            router.push(`/(tabs)?focusLat=${data.lat}&focusLng=${data.lng}`);
        }
    });
}
