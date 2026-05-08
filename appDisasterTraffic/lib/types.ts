/**
 * Shared types — phải khớp với backend `models/Alert.js`.
 *
 * Khi backend đổi schema, cập nhật ở đây để TypeScript bắt được sai sót sớm.
 */

export type AlertType =
    | 'fire'
    | 'flood'
    | 'traffic'
    | 'earthquake'
    | 'landslide'
    | 'storm'
    | 'other';

export type AlertSource =
    | 'ai'
    | 'community'
    | 'crawler'
    | 'usgs'
    | 'eonet'
    | 'manual';

export interface Alert {
    _id?: string;
    type: AlertType;
    source?: AlertSource;
    address: string;
    description?: string;
    severity?: number; // 1..5
    confidence?: number; // 0..1
    verified?: boolean;
    lng: number;
    lat: number;
    sourceUrl?: string;
    expiresAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

/** Payload gửi lên POST /api/alerts/community */
export interface CommunityReportPayload {
    type: AlertType;
    lng: number;
    lat: number;
    address?: string;
    description?: string;
    severity?: number;
}

// Camera registry

export type CameraKind = 'cctv' | 'youtube' | 'rtsp' | 'http' | 'mock';
export type CameraStatus = 'active' | 'paused' | 'broken' | 'pending';

export interface Camera {
    _id: string;
    name: string;
    kind: CameraKind;
    streamUrl: string;
    lng: number;
    lat: number;
    address?: string;
    allowedEventTypes?: AlertType[];
    status: CameraStatus;
    cooldownMs?: number;
    lastAlertAt?: string | null;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
}
