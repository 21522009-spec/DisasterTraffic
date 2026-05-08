import Constants from 'expo-constants';

/**
 * URL của backend DisasterTrafficWeb.
 *
 * Đọc từ app.json -> expo.extra.serverUrl. Khi đổi ngrok URL hoặc deploy
 * server thật, chỉ cần sửa app.json và rebuild — KHÔNG hardcode trong source.
 *
 * Fallback (nếu thiếu): chạy local dev (chỉ work trên simulator).
 */
const fromExpo = Constants.expoConfig?.extra?.serverUrl as string | undefined;

export const SERVER_URL = (fromExpo ?? 'http://localhost:3000').replace(/\/$/, '');

/** API base path. Tách ra để dễ đổi nếu sau này có /v1, /v2... */
export const API_BASE = `${SERVER_URL}/api`;
