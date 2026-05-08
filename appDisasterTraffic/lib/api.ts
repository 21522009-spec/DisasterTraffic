import axios, { AxiosInstance } from 'axios';
import { API_BASE } from './config';
import { getToken, logout } from './auth';
import type { Alert, Camera, CommunityReportPayload } from './types';

const client: AxiosInstance = axios.create({
    baseURL: API_BASE,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        // Bỏ qua trang cảnh báo của ngrok free tier khi gọi từ mobile app
        'ngrok-skip-browser-warning': 'true',
    },
});

// Tự gắn Bearer token nếu user đã login
client.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 401 → token hết hạn / không hợp lệ → auto logout
client.interceptors.response.use(
    (r) => r,
    async (err) => {
        if (err?.response?.status === 401) {
            await logout();
        }
        return Promise.reject(err);
    }
);

export interface FetchAlertsOptions {
    limit?: number;
    type?: string;
    source?: string;
    /** "minLon,minLat,maxLon,maxLat" */
    bbox?: string;
}

/** GET /api/alerts */
export async function fetchAlerts(
    opts: FetchAlertsOptions = {}
): Promise<Alert[]> {
    const params: Record<string, string | number> = {};
    if (opts.limit) params.limit = opts.limit;
    if (opts.type) params.type = opts.type;
    if (opts.source) params.source = opts.source;
    if (opts.bbox) params.bbox = opts.bbox;

    const { data } = await client.get<Alert[]>('/alerts', { params });
    return Array.isArray(data) ? data : [];
}

/** POST /api/alerts/community — không cần API key, có rate limit */
export async function submitCommunityReport(
    payload: CommunityReportPayload
): Promise<Alert> {
    const { data } = await client.post<{ message: string; data: Alert }>(
        '/alerts/community',
        payload
    );
    return data.data;
}

/** GET /api/cameras */
export async function fetchCameras(opts: { status?: string; limit?: number } = {}): Promise<Camera[]> {
    const params: Record<string, string | number> = {};
    if (opts.status) params.status = opts.status;
    if (opts.limit) params.limit = opts.limit;

    const { data } = await client.get<Camera[]>('/cameras', { params });
    return Array.isArray(data) ? data : [];
}

/** GET /api/health — check server status */
export async function checkHealth(): Promise<{
    status: string;
    mongo: string;
    time: string;
}> {
    const { data } = await client.get('/health');
    return data;
}

export default client;
